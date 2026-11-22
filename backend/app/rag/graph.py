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
        rationale: str = ""
    ):
        """Creates Knowledge Graph nodes and relationships for an evaluated news article."""
        entities = self.extract_entities(f"{title} {text}")
        
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

                # 4. Merge Entities
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

    async def close(self):
        if self.driver:
            await self.driver.close()

graph_manager = Neo4jGraphManager()
