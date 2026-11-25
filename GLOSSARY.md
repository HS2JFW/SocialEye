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
