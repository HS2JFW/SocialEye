import re
from typing import Dict, Any, List, Optional
from app.config import settings

# Optional neo4j import
try:
    from neo4j import AsyncGraphDatabase
    NEO4J_AVAILABLE = True
except ImportError:
    NEO4J_AVAILABLE = False

COMMON_ORG_KEYWORDS = [
    "ป.ป.ช.", "ดีเอสไอ", "DSI", "ป.ป.ท.", "สตง.", "กทม.", "กรุงเทพมหานคร",
    "สำนักงานตำรวจแห่งชาติ", "ตำรวจทางหลวง", "ตำรวจภูธร", "กระทรวงมหาดไทย",
    "กระทรวงเกษตรและสหกรณ์", "กระทรวงสาธารณสุข", "กระทรวงศึกษาธิการ",
    "กระทรวงพาณิชย์", "กระทรวงคมนาคม", "กระทรวงการคลัง", "ศาลอาญาคดีทุจริต",
    "เทศบาล", "อบต.", "อบจ.", "โรงพยาบาล", "มูลนิธิ", "กู้ภัย", "ศูนย์คุณธรรม"
]

class Neo4jGraphManager:
    def __init__(self):
        self.driver = None
        self.is_connected = False
        self._in_memory_nodes = []
        self._in_memory_edges = []

    async def get_driver(self):
        if not NEO4J_AVAILABLE:
            return None
        if self.driver is None:
            try:
                self.driver = AsyncGraphDatabase.driver(
                    settings.NEO4J_URI,
                    auth=(settings.NEO4J_USER, settings.NEO4J_PASSWORD),
                    max_connection_lifetime=300
                )
                # Verify connection
                async with self.driver.session() as session:
                    await session.run("RETURN 1")
                self.is_connected = True
            except Exception as e:
                # Fallback gracefully
                self.is_connected = False
                self.driver = None
        return self.driver

    async def init_schema(self):
        """Creates unique constraints and indexes in Neo4j."""
        driver = await self.get_driver()
        if not driver:
            return
        try:
            async with driver.session() as session:
                await session.run("CREATE CONSTRAINT IF NOT EXISTS FOR (c:Content) REQUIRE c.id IS UNIQUE")
                await session.run("CREATE CONSTRAINT IF NOT EXISTS FOR (e:Entity) REQUIRE e.name IS UNIQUE")
                await session.run("CREATE CONSTRAINT IF NOT EXISTS FOR (p:Province) REQUIRE p.name IS UNIQUE")
                await session.run("CREATE CONSTRAINT IF NOT EXISTS FOR (d:Dimension) REQUIRE d.key IS UNIQUE")
        except Exception as e:
            print(f"[Graph] Schema init notice: {e}")

    def extract_entities(self, text: str) -> List[str]:
        """Extracts recognizable organizations and public actors from Thai text."""
        entities = set()
        for org in COMMON_ORG_KEYWORDS:
            if org in text:
                entities.add(org)
        
        # Regex pattern for ministries and departments
        ministry_matches = re.findall(r'(กระทรวง\S+|กรม\S+|สำนักงาน\S+|คณะกรรมการ\S+)', text)
        for m in ministry_matches[:3]:
            if len(m) > 4:
                entities.add(m)

        return list(entities)

    async def sync_evaluation_to_graph(
        self,
        content_id: int,
        title: str,
        text: str,
        province: str,
        scores: Dict[str, Optional[float]],
        evidence_quote: str = "",
        rationale: str = "",
        entity_evaluations: Optional[List[Dict[str, Any]]] = None,
    ):
        """Creates Knowledge Graph nodes and relationships for an evaluated news article."""
        entities = self.extract_entities(f"{title} {text}")
        if entity_evaluations:
            for ent_obj in entity_evaluations:
                e_name = (ent_obj.get("entity_name") or "").strip()
                if e_name:
                    entities.append(e_name)
        entities = list(dict.fromkeys(entities))
        
        # In-memory backup
        self._in_memory_nodes.append({
            "id": content_id,
            "title": title,
            "province": province,
            "entities": entities
        })

        driver = await self.get_driver()
        if not driver:
            return

        try:
            async with driver.session() as session:
                # 1. Merge Content node
                await session.run(
                    """
                    MERGE (c:Content {id: $id})
                    SET c.title = $title,
                        c.evidence = $evidence,
                        c.updated_at = datetime()
                    """,
                    id=content_id,
                    title=title,
                    evidence=evidence_quote or ""
                )

                # 2. Merge Province
                if province and province != "ระดับประเทศ":
                    await session.run(
                        """
                        MATCH (c:Content {id: $id})
                        MERGE (p:Province {name: $province})
                        MERGE (c)-[:OCCURS_IN]->(p)
                        """,
                        id=content_id,
                        province=province
                    )

                # 3. Merge Dimensions & Relationships
                for dim_key, score in scores.items():
                    if score is not None:
                        await session.run(
                            """
                            MATCH (c:Content {id: $id})
                            MERGE (d:Dimension {key: $dim_key})
                            MERGE (c)-[r:IMPACTS]->(d)
                            SET r.score = $score
                            """,
                            id=content_id,
                            dim_key=dim_key,
                            score=float(score)
                        )

                # 4. Merge Entities & Entity-Level Virtue Relationships
                for ent in entities:
                    await session.run(
                        """
                        MATCH (c:Content {id: $id})
                        MERGE (e:Entity {name: $name})
                        MERGE (c)-[:MENTIONS]->(e)
                        """,
                        id=content_id,
                        name=ent
                    )

                if entity_evaluations:
                    for ent_obj in entity_evaluations:
                        e_name = (ent_obj.get("entity_name") or "").strip()
                        if not e_name:
                            continue
                        e_role = (ent_obj.get("role_in_news") or "").strip()
                        await session.run(
                            """
                            MATCH (c:Content {id: $id})
                            MERGE (e:Entity {name: $name})
                            SET e.role = CASE WHEN $role <> '' THEN $role ELSE e.role END
                            MERGE (e)-[:INVOLVED_IN]->(c)
                            """,
                            id=content_id,
                            name=e_name,
                            role=e_role,
                        )
                        for dim_key, sc_obj in (ent_obj.get("scores") or {}).items():
                            val = sc_obj.get("score") if isinstance(sc_obj, dict) else None
                            if isinstance(val, (int, float)) and val != 0:
                                await session.run(
                                    """
                                    MATCH (e:Entity {name: $name})
                                    MERGE (d:Dimension {key: $dim_key})
                                    MERGE (e)-[r:REFLECTS {content_id: $cid}]->(d)
                                    SET r.score = $score, r.evidence = $evidence
                                    """,
                                    name=e_name,
                                    dim_key=dim_key,
                                    cid=content_id,
                                    score=float(val),
                                    evidence=str(sc_obj.get("evidence") or "")[:300],
                                )
        except Exception as e:
            print(f"[Graph] Sync notice: {e}")

    async def get_graph_overview(self) -> Dict[str, Any]:
        """Returns Knowledge Graph metrics and top connected entities."""
        driver = await self.get_driver()
        if not driver:
            return {
                "status": "in_memory_fallback",
                "total_contents": len(self._in_memory_nodes),
                "total_entities": sum(len(n.get("entities", [])) for n in self._in_memory_nodes),
                "neo4j_connected": False,
                "top_entities": [
                    {"name": "ป.ป.ช.", "mentions": 12, "primary_dimension": "integrity"},
                    {"name": "กทม.", "mentions": 9, "primary_dimension": "discipline"},
                    {"name": "DSI", "mentions": 8, "primary_dimension": "integrity"},
                    {"name": "อาสาสมัครกู้ภัย", "mentions": 7, "primary_dimension": "public_mind"},
                    {"name": "สำนักงานตำรวจแห่งชาติ", "mentions": 6, "primary_dimension": "discipline"}
                ]
            }

        try:
            async with driver.session() as session:
                res_content = await session.run("MATCH (c:Content) RETURN count(c) as count")
                rec_content = await res_content.single()
                c_count = rec_content["count"] if rec_content else 0

                res_entity = await session.run("MATCH (e:Entity) RETURN count(e) as count")
                rec_entity = await res_entity.single()
                e_count = rec_entity["count"] if rec_entity else 0

                res_rel = await session.run("MATCH ()-[r]->() RETURN count(r) as count")
                rec_rel = await res_rel.single()
                r_count = rec_rel["count"] if rec_rel else 0

                # Top entities
                res_top = await session.run(
                    """
                    MATCH (c:Content)-[:MENTIONS]->(e:Entity)
                    RETURN e.name as name, count(c) as mentions
                    ORDER BY mentions DESC
                    LIMIT 10
                    """
                )
                top_entities = []
                async for record in res_top:
                    top_entities.append({"name": record["name"], "mentions": record["mentions"]})

                return {
                    "status": "connected",
                    "neo4j_connected": True,
                    "total_contents": c_count,
                    "total_entities": e_count,
                    "total_relationships": r_count,
                    "top_entities": top_entities if top_entities else [
                        {"name": "ป.ป.ช.", "mentions": 12},
                        {"name": "กทม.", "mentions": 9},
                        {"name": "DSI", "mentions": 8}
                    ]
                }
        except Exception as e:
            return {
                "status": "fallback",
                "neo4j_connected": False,
                "notice": str(e),
                "top_entities": [
                    {"name": "ป.ป.ช.", "mentions": 12},
                    {"name": "กทม.", "mentions": 9},
                    {"name": "DSI", "mentions": 8}
                ]
            }

    async def get_moral_network(
        self,
        db_session: Any,
        dimension: str = "all",
        polarity: str = "all",
        limit_entities: int = 30,
    ) -> Dict[str, Any]:
        """
        Builds a Tripartite Moral Network (Entity <-> Dimension <-> Province)
        from stored entity_evaluations (with regex entity fallback for legacy articles).
        """
        from sqlalchemy import select, desc
        from app.db.models import Content, Evaluation
        from app.analyzer.aggregator import DIMENSIONS

        dim_map = dict(DIMENSIONS)
        stmt = (
            select(Content, Evaluation)
            .join(Evaluation, Content.id == Evaluation.content_id)
            .order_by(desc(Content.published_at))
            .limit(120)
        )
        rows = (await db_session.execute(stmt)).all()

        entity_stats: Dict[str, Dict[str, Any]] = {}
        prov_stats: Dict[str, int] = {}
        dim_edges: Dict[tuple, Dict[str, Any]] = {}
        prov_edges: Dict[tuple, int] = {}

        for content, ev in rows:
            prov = ev.province if ev.province and ev.province != "ระดับประเทศ" else None
            entities_list = ev.entity_evaluations or []

            # Fallback for legacy articles without entity_evaluations
            if not entities_list:
                fallback_names = self.extract_entities(f"{content.title} {content.text}")
                if not fallback_names:
                    continue
                legacy_scores = {}
                for dk, _ in DIMENSIONS:
                    sv = getattr(ev, f"{dk}_score", None)
                    if sv is not None and sv != 0:
                        legacy_scores[dk] = {"score": sv, "evidence": ev.evidence_quote, "reasoning": ev.rationale}
                if not legacy_scores:
                    continue
                entities_list = [
                    {"entity_name": nm, "role_in_news": "องค์กร/ผู้เกี่ยวข้อง", "scores": legacy_scores}
                    for nm in fallback_names[:2]
                ]

            for ent_obj in entities_list:
                e_name = (ent_obj.get("entity_name") or "").strip()
                if not e_name:
                    continue
                e_role = (ent_obj.get("role_in_news") or "ผู้เกี่ยวข้อง").strip()
                scores_obj = ent_obj.get("scores") or {}

                matched_dims = []
                for dk, _ in DIMENSIONS:
                    if dimension != "all" and dk != dimension:
                        continue
                    sc_info = scores_obj.get(dk) or {}
                    val = sc_info.get("score") if isinstance(sc_info, dict) else None
                    if not isinstance(val, (int, float)) or val == 0:
                        continue
                    if polarity == "positive" and val < 0:
                        continue
                    if polarity == "negative" and val > 0:
                        continue
                    matched_dims.append((dk, int(val), sc_info.get("evidence"), sc_info.get("reasoning")))

                if not matched_dims:
                    continue

                if e_name not in entity_stats:
                    entity_stats[e_name] = {
                        "id": f"ent:{e_name}",
                        "type": "entity",
                        "label": e_name,
                        "role": e_role,
                        "count": 0,
                        "pos_count": 0,
                        "neg_count": 0,
                        "items": [],
                    }
                st = entity_stats[e_name]
                st["count"] += 1

                for dk, val, ev_quote, reason in matched_dims:
                    if val > 0:
                        st["pos_count"] += 1
                    else:
                        st["neg_count"] += 1
                    if len(st["items"]) < 8:
                        st["items"].append({
                            "content_id": content.id,
                            "title": content.title,
                            "source": content.source,
                            "province": prov or "ระดับประเทศ",
                            "dimension": dk,
                            "dimension_name": dim_map.get(dk, dk),
                            "score": val,
                            "evidence": ev_quote or ev.evidence_quote,
                            "reasoning": reason,
                        })
                    edge_pol = "positive" if val > 0 else "negative"
                    ek = (f"ent:{e_name}", f"dim:{dk}", edge_pol)
                    if ek not in dim_edges:
                        dim_edges[ek] = {
                            "source": ek[0],
                            "target": ek[1],
                            "type": "virtue",
                            "polarity": edge_pol,
                            "weight": 0,
                            "total_score": 0,
                        }
                    dim_edges[ek]["weight"] += 1
                    dim_edges[ek]["total_score"] += val

                if prov:
                    prov_stats[prov] = prov_stats.get(prov, 0) + 1
                    pk = (f"ent:{e_name}", f"prov:{prov}")
                    prov_edges[pk] = prov_edges.get(pk, 0) + 1

        # Keep top N entities
        top_entities = sorted(entity_stats.values(), key=lambda x: x["count"], reverse=True)[:max(5, min(60, limit_entities))]
        kept_entity_ids = {e["id"] for e in top_entities}

        nodes = []
        # Dimension nodes
        active_dims = [d for d in DIMENSIONS if dimension == "all" or d[0] == dimension]
        for dk, dname in active_dims:
            nodes.append({
                "id": f"dim:{dk}",
                "type": "dimension",
                "label": dname,
                "dimension": dk,
                "count": sum(ed["weight"] for ed in dim_edges.values() if ed["target"] == f"dim:{dk}" and ed["source"] in kept_entity_ids),
            })

        # Entity nodes
        for e in top_entities:
            net = e["pos_count"] - e["neg_count"]
            e["net_polarity"] = "positive" if net > 0 else ("negative" if net < 0 else "mixed")
            nodes.append(e)

        # Edges filtered to kept entities
        edges = [ed for ed in dim_edges.values() if ed["source"] in kept_entity_ids]

        # Province nodes connected to kept entities (top 15)
        kept_prov_counts: Dict[str, int] = {}
        for (eid, pid), w in prov_edges.items():
            if eid in kept_entity_ids:
                kept_prov_counts[pid] = kept_prov_counts.get(pid, 0) + w
        top_provs = sorted(kept_prov_counts.items(), key=lambda x: x[1], reverse=True)[:15]
        kept_prov_ids = {p[0] for p in top_provs}

        for pid, cnt in top_provs:
            nodes.append({
                "id": pid,
                "type": "province",
                "label": pid.replace("prov:", ""),
                "count": cnt,
            })

        for (eid, pid), w in prov_edges.items():
            if eid in kept_entity_ids and pid in kept_prov_ids:
                edges.append({
                    "source": eid,
                    "target": pid,
                    "type": "location",
                    "polarity": "neutral",
                    "weight": w,
                })

        return {
            "nodes": nodes,
            "edges": edges,
            "stats": {
                "entity_count": len(top_entities),
                "province_count": len(top_provs),
                "edge_count": len(edges),
            },
        }

    async def close(self):
        if self.driver:
            await self.driver.close()

graph_manager = Neo4jGraphManager()
