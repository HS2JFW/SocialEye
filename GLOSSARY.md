# SocialEye

SocialEye is an AI-assisted media monitoring and moral index system tracking five core Thai virtues (พอเพียง, วินัย, สุจริต, จิตอาสา, กตัญญู) across online news and social platforms.

## Language

### Access Control

**Viewer**:
An authenticated member who can inspect dashboards, the 77-province map, issue clusters, published policy reports, AI Chat, and CSV exports, without modifying data or system settings.
_Avoid_: Guest, Executive, Reader

**Analyst**:
An authenticated domain specialist authorized to perform all Viewer actions plus label content in the Quality Center, curate Golden Samples, generate policy report drafts, and review or publish reports.
_Avoid_: Reviewer, Moral Expert, Annotator

**Admin**:
An authenticated system operator authorized to perform all Analyst actions plus trigger data ingestion connectors, execute PDPA data retention, and inspect backups and system configuration.
_Avoid_: Superuser, Operator

**Role Group**:
An Authentik group claim (`socialeye-admins`, `socialeye-analysts`, or `socialeye-viewers`) mapped directly to a canonical SocialEye role; authenticated users outside these three groups are denied access.
_Avoid_: Permission Role, Access Tier

### System Configuration

**Data Source**:
A configured external feed or connector (such as an RSS feed, Google News query, YouTube channel, Pantip board, or Wisesight import) that supplies media content for moral evaluation.
_Avoid_: Feed, Scraper, Channel

**Alert Rule**:
A configurable threshold and cooldown policy (such as 24-hour index shift or severe polarity trigger) that determines when anomaly notifications are raised and dispatched.
_Avoid_: Notification Trigger, Threshold

**Retention Policy**:
The configurable number of days raw media content and embeddings are retained before automated PDPA purge, while preserving aggregated daily indices and published reports.
_Avoid_: Cleanup Job, Expiry Setting

**System Prompt**:
The editable behavioral instructions and domain guidelines for an AI agent (Scoring, Chat, or Policy Advisor), separated from any locked output schema required by the system.
_Avoid_: Prompt Template, Instruction String

**Moral Rubric**:
The structured evaluation criteria comprising per-virtue definitions, five-level polarity criteria (-2 to +2), boundary rules, and core analysis rules used to score content consistently.
_Avoid_: Scoring Guide, Evaluation Matrix

**Boundary Rule**:
A disambiguation rule attached to a virtue that specifies how to separate overlapping concepts (such as negligence vs. bribery, or official duty vs. voluntary public-mind action).
_Avoid_: Edge Case Rule, Special Rule

**Entity Evaluation**:
The per-actor moral assessment extracted from a news item, recording an individual, group, or organization's role, virtue scores, verbatim evidence, and reasoning without canceling out other actors.
_Avoid_: Actor Score, Character Rating
