---
name: software-architecture
description: System architecture diagrams for software systems
domain-indicators:
  - software
  - system
  - api
  - microservice
  - server
  - database
  - backend
  - frontend
  - cloud
  - infrastructure
  - deployment
  - kubernetes
  - docker
  - aws
  - architecture
---

# Archetype: Software Architecture

This archetype defines the visual conventions, icon mappings, connection semantics, and layout preferences for **software system architecture** diagrams. It covers client-server systems, microservices, cloud infrastructure, API gateways, authentication flows, and data pipelines.

## JSON Schema

The diagram output is a JSON file. The output location is determined by the `/knowledge-base diagram` command based on vault detection (vault root or cwd).

### Top-Level Structure

```json
{
  "title": "string",
  "layers": [LayerDef],
  "nodes": [SerializedNodeData],
  "connections": [Connection],
  "layerManualSizes": {},
  "lineCurve": "orthogonal",
  "flows": [FlowDef]
}
```

### LayerDef

```json
{
  "id": "ly-<short-id>",
  "title": "LAYER TITLE IN UPPERCASE",
  "bg": "#hex6",
  "border": "#hex6"
}
```

### SerializedNodeData

```json
{
  "id": "el-<short-id>",
  "label": "Node Label",
  "sub": "Optional subtitle/description",
  "icon": "IconName",
  "x": 450,
  "y": 100,
  "w": 210,
  "layer": "ly-<layer-id>"
}
```

### Connection

```json
{
  "id": "dl-<short-id>",
  "from": "el-<source-id>",
  "to": "el-<target-id>",
  "fromAnchor": "bottom-1",
  "toAnchor": "top-1",
  "color": "#hex6",
  "label": "Connection Label"
}
```

### FlowDef

Flows are named groupings of contiguous connections that represent end-to-end data paths through the architecture. When a flow is selected in the app, all non-included elements, connections, and layers dim to highlight the path.

```json
{
  "id": "flow-<descriptive-short-id>",
  "name": "Human Readable Flow Name",
  "connectionIds": ["dl-conn1", "dl-conn2", "dl-conn3"]
}
```

**Contiguity constraint**: Connections in a flow MUST form a connected graph -- each connection must share at least one node (`from`/`to`) with another connection in the flow. The app validates this and rejects non-contiguous flows.

**Ordering**: List `connectionIds` in traversal order (source -> destination) for logical readability.

## Layer Conventions

| Layer Category | Purpose | Background | Border |
|---------------|---------|------------|--------|
| Clients | User-facing entry points (browsers, mobile apps, CLI) | `#eff6ff` | `#bfdbfe` |
| Filters / Middleware | Request processing, interceptors, middleware chains | `#fef3c7` | `#fcd34d` |
| Authentication | Identity verification (login, OAuth, LDAP, JWT) | `#ecfdf5` | `#6ee7b7` |
| Authorization | Access control, role checking, policy enforcement | `#fdf2f8` | `#f9a8d4` |
| Application | Business logic, controllers, services, use cases | `#f5f3ff` | `#c4b5fd` |
| Data / Infrastructure | Databases, caches, file storage, message queues | `#f1f5f9` | `#cbd5e1` |
| Networking | Load balancers, API gateways, DNS, proxies | `#ecfeff` | `#a5f3fc` |
| Monitoring | Logging, metrics, alerting, health checks | `#fff1f2` | `#fecdd3` |

## Icon Mappings

Invalid icon names default to `Database`.

| Domain Concept | Icon | Notes |
|---------------|------|-------|
| Web browser / web client | `Globe` | Any browser-based entry point |
| Mobile app | `Smartphone` | iOS, Android, or hybrid mobile clients |
| Tablet client | `Tablet` | Tablet-specific interfaces |
| Desktop app | `Laptop` | Desktop / Electron apps |
| Monitor / dashboard | `Monitor` | Admin dashboards, monitoring UIs |
| API gateway / reverse proxy | `Router` | Request routing, load balancing |
| Server / service | `Server` | Generic backend service or server |
| Server with config | `ServerCog` | Configurable server, server management |
| Microservice / container | `Container` | Docker containers, pods |
| Database / data store | `Database` | Relational, NoSQL, any persistent store |
| Database with performance | `DatabaseZap` | High-performance or real-time data store |
| Cache / in-memory store | `Zap` | Redis, Memcached, in-memory caching |
| Hard drive / file storage | `HardDrive` | File systems, block storage, S3 |
| Cloud service | `Cloud` | Generic cloud / external SaaS |
| Cloud with config | `CloudCog` | Cloud service with configuration |
| Authentication / credentials | `Key` | Login, credential verification |
| Security / firewall | `Shield` | Generic security, WAF, firewall |
| Security verified | `ShieldCheck` | Verified security, SSL, certificates |
| Lock / encryption | `Lock` | Encryption, secure storage |
| Biometrics / identity | `Fingerprint` | Biometric auth, identity providers |
| User / account | `User` | Single user, account, profile |
| User group / team | `Users` | Multi-user, teams, organizations |
| Code / source | `Code` | Source code, code generation |
| File with code | `FileCode` | Config files, scripts, templates |
| Terminal / CLI | `Terminal` | Command-line interfaces, SSH |
| CPU / compute | `Cpu` | Compute instances, processing |
| Network / mesh | `Network` | Service mesh, network topology |
| Cable / connection | `Cable` | Direct connections, wiring |
| Plug / integration | `Plug` | Plugin, integration, adapter |
| Settings / config | `Cog` | Configuration, settings service |
| Layers / abstraction | `Layers` | Abstraction layers, middleware stack |
| Email / notifications | `Mail` | Email service, notification system |
| Alert / notification | `Bell` | Alerting, push notifications |
| Activity / metrics | `Activity` | Monitoring, health checks, metrics |
| Analytics / charts | `BarChart` | Analytics, reporting, BI |
| Archive / backup | `Archive` | Backup, archival storage |
| Package / artifact | `Box` | Package registry, artifact storage |
| Folder / directory | `Folder` | File organization, directory service |
| Git / version control | `GitBranch` | Source control, CI/CD |
| WiFi / wireless | `Wifi` | Wireless networking |
| Radio / broadcast | `Radio` | Event broadcasting, pub/sub |

## Connection Semantics

| Flow Type | Color | Meaning |
|-----------|-------|---------|
| Primary request flow | `#3b82f6` (blue) | HTTP requests, main data path |
| Authentication / security | `#10b981` (green) | Auth delegation, credential verification |
| Authorization / decisions | `#f59e0b` (amber) | Access decisions, exceptions |
| Data access | `#64748b` (slate) | Database queries, storage access |
| Application logic | `#8b5cf6` (purple) | Business logic, service calls |
| Error / fallback | `#ef4444` (red) | Error paths, circuit breakers |

## Layout Preferences

- **Primary flow direction:** top-to-bottom
- **Center axis:** x ~ 750 (all layers and symmetric groups align around this)
- **Density:** moderate (balanced spacing for readability with connection routing room)
- **Emphasis:** the primary request path (top-to-bottom blue flow) should be the visual spine

### Anchor Points

Each node has 12 anchor points (3 per side):

| Side | Positions (at 25%, 50%, 75% of edge) |
|------|--------------------------------------|
| Top | `top-0`, `top-1`, `top-2` |
| Bottom | `bottom-0`, `bottom-1`, `bottom-2` |
| Left | `left-0`, `left-1`, `left-2` |
| Right | `right-0`, `right-1`, `right-2` |

## Critical Spacing Rules

These rules MUST be followed to prevent node collisions and ensure clean connection routing.

### Node Dimensions

- **Default width**: 210px (valid range: 110-230px)
- **Node height**: 70px for w >= 140, 60px for w = 110 or 130

### Minimum Gaps (from constants.ts)

- `NODE_GAP` = 8px minimum between nodes (use **70px+** for connection routing room)
- `LAYER_GAP` = 10px minimum between layer boundaries (use **50px+** for visual clarity)
- `LAYER_PADDING` = 25px inside layers around nodes
- `LAYER_TITLE_OFFSET` = 20px extra vertical space at top of layer for title

### Layer Auto-Sizing Formula

Layers auto-size around their nodes:

- **Left**: `minNodeX - 25`
- **Right**: `maxNodeX + maxNodeW + 25`
- **Top**: `minNodeY - 45` (25 padding + 20 title offset)
- **Bottom**: `maxNodeY + nodeHeight + 25`

### Connection Routing Constants

- `STUB_LENGTH` = 20px (connection extends perpendicular from anchor)
- `OBSTACLE_PADDING` = 15px (nodes inflated by this for routing avoidance)
- `CORNER_RADIUS` = 6px (rounded corners on orthogonal paths)

### Required Spacing for Clean Layouts

| Between | Minimum | Recommended | Why |
|---------|---------|-------------|-----|
| Nodes in same row | 8px | **70px** | Stub(20) + ObstaclePad(15) on each side = 70px for connections to route between |
| Nodes in same layer, different rows | 8px | **80px** vertical | Space for horizontal connection segments |
| Node edges across adjacent layers | -- | **120-160px** | Stubs(20x2) + routing room + label space |
| Layer boundaries | 10px | **50-80px** | Visual separation + routing corridors |

### Layout Planning Checklist

1. **Plan layers top-to-bottom** with 120-160px vertical gaps between node edges across layers
2. **Horizontal nodes** (like filter chains) should use 70px gaps for right-1 -> left-1 connections
3. **Verify layer boundaries don't overlap**: `layerN_bottom + 50 < layerN+1_top`
4. **Cross-layer connections** (skipping layers) need clear routing corridors -- avoid placing nodes directly in the path
5. **Anchor selection**: use `bottom-N` -> `top-N` for vertical flows, `right-N` -> `left-N` for horizontal chains

## Symmetry Rules

Diagrams should maximize visual symmetry. These rules take priority during coordinate computation.

### Center Axis

1. **Establish a vertical center axis** (typically x~750) that all layers align around
2. **Symmetric pairs** (e.g., Browser/Mobile, AuthnManager/JWT) should mirror around this axis
3. **Symmetric triads** (e.g., 3 providers, 3 voters, Controller/Service/Repository) should have equal spacing with the middle node on or near the center axis

### Within-Layer Consistency

1. **Same gap within a row**: All adjacent nodes in a row must use identical spacing (e.g., 30px, 40px, or 50px -- pick one per row and apply uniformly)
2. **Row alignment**: Nodes in the same logical row share the same Y coordinate
3. **Vertically aligned connections**: When possible, position data-layer nodes directly below their upstream connections for straight vertical lines

## Condition Nodes

Condition nodes (`"shape": "condition"`) live on the canvas (no `layer` property) and **must not overlap any layer bounds**. To place them between two layers:

1. **Create sufficient gap**: Adjust `layerManualSizes` to ensure at least `conditionHeight + 2 * LAYER_GAP + 20px` gap between adjacent layers (typically 110-120px)
2. **Center in the gap**: Place the condition at the Y midpoint between the two layer boundaries
3. **Center on the main axis**: Place at x~centerAxis when the condition's connections fan out symmetrically below
4. **Collision verification formula**:
   - `conditionTop > upperLayerBottom + LAYER_GAP`
   - `conditionBottom < lowerLayerTop - LAYER_GAP`
   - Where conditionTop/Bottom = `y +/- conditionHalfHeight` (halfHeight ~ 40px)
5. **When no gap exists**: If layers are adjacent with no room, place the condition to the **right** of the wider layer (x > layerRight + LAYER_GAP + conditionHalfWidth)

## Connection Label Positioning

All connections have a `labelPosition` (0.0-1.0, default 0.5) controlling where the label sits along the path. **Do not leave all labels at 0.5** -- adjust to prevent overlaps:

| Scenario | labelPosition | Rationale |
|----------|--------------|-----------|
| Condition outputs (cond-out -> element) | **0.70** | Push label toward target, away from diamond |
| Short vertical fan-outs (parent -> children) | **0.60** | Nudge toward children to avoid crowding parent |
| Long diagonal connections (crossing layers) | **0.20-0.30** | Keep label near source, away from intermediate layers |
| Cross-layer horizontal connections | **0.70** | Keep near target end, away from crowded source area |
| Very long return paths (error -> client) | **0.15-0.20** | Keep near source to avoid crossing everything |
| Short horizontal chain connections | **0.50** | Midpoint is fine for horizontal chains with adequate gaps |

## Flow Design Guidelines

1. **Identify all meaningful end-to-end paths** through the architecture (e.g., "Browser Request -> Response", "Authentication via LDAP", "Data Write Path")
2. **Create flows for each distinct path** -- include both happy paths and error/fallback paths
3. **Flows can share connections** -- e.g., a "Browser Happy Path" and a "Mobile Happy Path" may share downstream connections
4. **Name flows descriptively** -- use names like "Browser Happy Path", "OAuth2 Authentication", "Error Handling" rather than generic "Flow 1"
5. **Verify contiguity** -- every connection in a flow must share a node with at least one other connection in the same flow

### Flow Categories to Consider

| Category | Description | Example |
|----------|-------------|---------|
| Happy path | Full request -> response path | Browser -> Filters -> Auth -> App -> DB |
| Authentication paths | Per-provider auth flows | OAuth2: Filter -> Manager -> Provider -> External |
| Error / exception paths | Failure handling routes | Auth failure -> Exception handler -> Error response |
| Data access paths | Storage read/write flows | Service -> Repository -> Database |
| Cross-cutting paths | Shared infrastructure flows | Session management, logging pipeline |

## Design Process

1. **Identify layers** -- group components by architectural concern (client, gateway, service, data, etc.)
2. **List all nodes** per layer with appropriate icons
3. **Map connections** between nodes with labeled data flows
4. **Establish center axis** -- pick x~750 and design symmetric pairs/triads around it
5. **Compute coordinates** -- start from y=100, add 120-160px between layer node edges; create wider gaps (110-120px) where condition nodes need to sit between layers
6. **Verify all gaps** -- check node-to-node (consistent per row), layer-to-layer, and cross-layer spacing
7. **Position condition nodes** -- center in gaps between layers, verify no layer collisions
8. **Adjust label positions** -- set `labelPosition` per the table above to prevent label-element overlaps
9. **Assign colors** -- use distinct colors per flow type for readability
10. **Define flows** -- trace all meaningful end-to-end paths through the connections, verify each is contiguous, and name them descriptively

## Verification

After creating the JSON, load it in the app to verify:

1. All layers render with correct colors and titles
2. All nodes are positioned within their layers without overlap
3. All connections route cleanly between nodes
4. Labels are readable and don't overlap connections
5. All flows are listed in the Architecture Properties panel
6. Selecting a flow correctly dims non-included elements
