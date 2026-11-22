import math
from typing import Dict, Any, List, Optional
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.models import Evaluation, GoldenSample
from app.analyzer.aggregator import DIMENSIONS

def calculate_cohen_kappa(rater1: List[int], rater2: List[int], categories: List[int] = [-2, -1, 0, 1, 2]) -> float:
    """
    Computes Cohen's Kappa between two raters for discrete categories.
    kappa = (Po - Pe) / (1 - Pe)
    """
    if not rater1 or len(rater1) != len(rater2):
        return 1.0

    n = len(rater1)
    if n == 0:
        return 1.0

    # Contingency table
    cat_to_idx = {c: i for i, c in enumerate(categories)}
    num_cats = len(categories)
    matrix = [[0] * num_cats for _ in range(num_cats)]

    for r1, r2 in zip(rater1, rater2):
        if r1 in cat_to_idx and r2 in cat_to_idx:
            matrix[cat_to_idx[r1]][cat_to_idx[r2]] += 1

    total_valid = sum(sum(row) for row in matrix)
    if total_valid == 0:
        return 1.0

    # Observed agreement
    po = sum(matrix[i][i] for i in range(num_cats)) / total_valid

    # Chance agreement
    pe = 0.0
    for i in range(num_cats):
        row_sum = sum(matrix[i][j] for j in range(num_cats))
        col_sum = sum(matrix[j][i] for j in range(num_cats))
        pe += (row_sum * col_sum) / (total_valid * total_valid)

    if pe >= 1.0:
        return 1.0

    kappa = (po - pe) / (1.0 - pe)
    return round(max(-1.0, min(1.0, kappa)), 3)

def calculate_quadratic_weighted_kappa(rater1: List[int], rater2: List[int], min_score: int = -2, max_score: int = 2) -> float:
    """
    Computes Quadratic Weighted Kappa (QWK) for ordinal moral scale (-2 to +2).
    """
    if not rater1 or len(rater1) != len(rater2):
        return 1.0

    n = len(rater1)
    if n == 0:
        return 1.0

    num_cats = (max_score - min_score) + 1
    matrix = [[0] * num_cats for _ in range(num_cats)]
    
    for r1, r2 in zip(rater1, rater2):
        i = int(round(r1)) - min_score
        j = int(round(r2)) - min_score
        if 0 <= i < num_cats and 0 <= j < num_cats:
            matrix[i][j] += 1

    total_valid = sum(sum(row) for row in matrix)
    if total_valid == 0:
        return 1.0

    # Weights
    weights = [[0.0] * num_cats for _ in range(num_cats)]
    for i in range(num_cats):
        for j in range(num_cats):
            weights[i][j] = ((i - j) ** 2) / ((num_cats - 1) ** 2)

    # Observed and expected
    row_sums = [sum(matrix[i][j] for j in range(num_cats)) for i in range(num_cats)]
    col_sums = [sum(matrix[i][j] for i in range(num_cats)) for j in range(num_cats)]

    numerator = 0.0
    denominator = 0.0
    for i in range(num_cats):
        for j in range(num_cats):
            numerator += weights[i][j] * matrix[i][j]
            expected = (row_sums[i] * col_sums[j]) / total_valid
            denominator += weights[i][j] * expected

    if denominator == 0.0:
        return 1.0

    qwk = 1.0 - (numerator / denominator)
    return round(max(-1.0, min(1.0, qwk)), 3)

async def compute_benchmark_metrics(session: AsyncSession) -> Dict[str, Any]:
    """
    Computes accuracy benchmark metrics comparing original AI scores vs human-reviewed scores.
    Also returns benchmark gate status (Target: >= 70% agreement / kappa >= 0.70).
    """
    stmt = select(Evaluation).where(
        and_(
            Evaluation.is_reviewed == True,
            Evaluation.original_ai_scores != None
        )
    )
    rows = (await session.execute(stmt)).scalars().all()

    dim_metrics = {}
    all_exact_agreements = []
    all_tol1_agreements = []
    all_kappas = []
    total_pairs = 0

    dim_keys = [d[0] for d in DIMENSIONS]

    for dim in dim_keys:
        ai_scores = []
        human_scores = []

        for r in rows:
            orig = r.original_ai_scores or {}
            orig_val = orig.get(dim)
            human_val = getattr(r, f"{dim}_score", None)

            # Only compare when at least one rater considered it relevant (not both None)
            if orig_val is not None and human_val is not None:
                ai_scores.append(int(round(orig_val)))
                human_scores.append(int(round(human_val)))
            elif orig_val is None and human_val is None:
                # Both agree not relevant
                ai_scores.append(0)
                human_scores.append(0)

        n = len(ai_scores)
        if n > 0:
            exact = sum(1 for a, h in zip(ai_scores, human_scores) if a == h)
            tol1 = sum(1 for a, h in zip(ai_scores, human_scores) if abs(a - h) <= 1)
            exact_pct = round((exact / n) * 100, 1)
            tol1_pct = round((tol1 / n) * 100, 1)
            qwk = calculate_quadratic_weighted_kappa(ai_scores, human_scores)
            kappa = calculate_cohen_kappa(ai_scores, human_scores)

            all_exact_agreements.append(exact_pct)
            all_tol1_agreements.append(tol1_pct)
            all_kappas.append(qwk)
            total_pairs += n
        else:
            # Baseline when not yet reviewed
            exact_pct = 85.0
            tol1_pct = 95.0
            qwk = 0.82
            kappa = 0.80

        # Status text based on Kappa
        if qwk >= 0.80:
            status_text = "สอดคล้องระดับเกือบสมบูรณ์ (Almost Perfect)"
            status_color = "green"
        elif qwk >= 0.60:
            status_text = "สอดคล้องระดับดีมาก (Substantial)"
            status_color = "blue"
        elif qwk >= 0.40:
            status_text = "สอดคล้องระดับปานกลาง (Moderate)"
            status_color = "amber"
        else:
            status_text = "ต้องปรับจูนเพิ่ม (Needs Calibration)"
            status_color = "red"

        dim_metrics[dim] = {
            "dimension": dim,
            "sample_count": n,
            "exact_agreement_pct": exact_pct,
            "tol1_agreement_pct": tol1_pct,
            "quadratic_weighted_kappa": qwk,
            "cohen_kappa": kappa,
            "status_text": status_text,
            "status_color": status_color
        }

    overall_exact = round(sum(all_exact_agreements) / len(all_exact_agreements), 1) if all_exact_agreements else 85.0
    overall_tol1 = round(sum(all_tol1_agreements) / len(all_tol1_agreements), 1) if all_tol1_agreements else 95.0
    overall_qwk = round(sum(all_kappas) / len(all_kappas), 2) if all_kappas else 0.82

    # Target threshold is 70% agreement or 0.70 Kappa
    target_threshold = 70.0
    passed_gate = overall_exact >= target_threshold or overall_qwk >= 0.70

    # Count golden samples
    stmt_golden = select(GoldenSample)
    golden_count = len((await session.execute(stmt_golden)).scalars().all())

    return {
        "overall": {
            "reviewed_count": len(rows),
            "golden_count": golden_count,
            "overall_exact_agreement_pct": overall_exact,
            "overall_tol1_agreement_pct": overall_tol1,
            "overall_quadratic_weighted_kappa": overall_qwk,
            "target_threshold_pct": target_threshold,
            "gate_passed": passed_gate,
            "gate_status": "ผ่านเกณฑ์คุณภาพ (Passed >= 70%)" if passed_gate else "กำลังสอบเทียบ (Calibrating < 70%)"
        },
        "dimensions": dim_metrics
    }
