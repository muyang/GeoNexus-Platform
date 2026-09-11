# GeoNexus Product Architecture

## Positioning

GeoNexus is a federated GeoAI capability network.

It is not only a GIS platform, data hub, model hub, or agent platform. Its core asset is capability: the reusable unit that exposes geospatial intelligence across sovereign nodes without forcing all data into one centralized cloud.

## Product Thesis

The next durable layer in GeoAI is not raw satellite data, individual models, or autonomous agents. It is a standard capability network where organizations can publish, discover, route, execute, and audit geospatial capabilities.

GeoNexus combines:

- GeoMCP: protocol layer for capability discovery, context, execution, async jobs, and agent collaboration
- GeoSkills: reusable geospatial capability units such as flood impact analysis or crop monitoring
- GeoNodes: federated providers of data, models, skills, compute, agents, and policies
- GeoAgents: planning and orchestration workers that compose skills into workflows
- GeoFederation: trust, governance, sovereignty, and policy enforcement across nodes

## MVP User Stories

1. A disaster-response analyst searches for flood analysis capabilities.
2. GeoNexus finds relevant GeoSkills and their required inputs/outputs.
3. The routing layer selects an eligible node based on region, policy, latency, and trust level.
4. A GeoAgent composes a workflow DAG using registered skills.
5. The workflow runs as an asynchronous task with checkpoints.
6. The analyst sees status, outputs, provenance, and recommended next actions.

## Capability Model

Every asset in the network is represented as a GeoCapability.

Capability types:

- GeoDataCapability
- GeoModelCapability
- GeoSkillCapability
- GeoAgentCapability
- GeoComputeCapability
- GeoPolicyCapability
- GeoWorkflowCapability

Common fields:

- id
- name
- type
- provider
- node
- regions
- inputs
- outputs
- protocols
- policies
- trustLevel
- latencyClass
- costClass
- status

## GeoSkill Model

GeoSkill is the primary reusable capability unit.

Example:

```yaml
name: flood-impact-analysis
inputs:
  - region
  - date_range
  - water_extent_source
outputs:
  - flood_map
  - affected_population
  - crop_loss_estimate
steps:
  - retrieve_satellite
  - flood_segmentation
  - overlay_admin_boundaries
  - zonal_statistics
  - generate_report
```

## Architecture

```text
User / Application
        |
GeoAgent Planner
        |
GeoCapability Registry
        |
Capability Router
        |
GeoMCP Execution Gateway
        |
Federated GeoCapability Nodes
        |
Data / Models / Skills / Compute / Policies
```

## MVP Boundaries

In scope:

- Static interactive product prototype
- Sample capability registry
- Search/filter/discovery
- Skill detail model
- Routing simulation
- Async task lifecycle simulation
- Agent DAG visualization

Out of scope for this first MVP:

- Real MCP server
- Real geospatial processing
- Authentication and billing
- Multi-tenant persistence
- Live map rendering

## Next Build Milestones

1. Replace in-browser sample data with a registry API.
2. Implement GeoMCP endpoints for discovery and execution.
3. Add real job queue and task state persistence.
4. Connect one real GeoSkill such as NDVI or flood extent analysis.
5. Add node onboarding, policy checks, and audit logs.
