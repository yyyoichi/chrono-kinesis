# Chrono-Kinesis API Reference Documentation Style Guide

## Overview
This guide defines the writing style and terminology conventions for API reference documentation in the chrono-kinesis project. Both Japanese and English documentation must follow these guidelines consistently.

## Document Structure

### Standard Format
Each port documentation follows this structure:

1. **YAML Frontmatter**: Title only
2. **Interface**: TypeScript code block (unchanged, preserve exactly)
3. **PURPOSE**: Describes the port's role and when to use it
4. **Description Table**: Method/member table with Type | Description columns
5. **NOTE**: Implementation details, inheritance relationships, usage constraints, and behavioral contracts

### Table Format
Use markdown tables with consistent columns:
- For methods/members: `Member/Method/Property | Description`
- For parameters: `Parameter | Description`

## Writing Style

### Tone & Register
- **Technical and concise**: Avoid unnecessary elaboration
- **Prescriptive, not descriptive**: Use "must", "should", "expected to", "ensure"
- **Active voice preferred**: Direct statement of responsibility
- **Contractual language**: Emphasize behavioral expectations and constraints

### Sentence Structure
- Short sentences with clear subject-verb-object order
- Use semicolons to separate related independent clauses
- Lead with the most important information

### Example Patterns

**PURPOSE Section:**
```
A port [to do/providing/expressing] [what/how].
Used [when/where/for what purpose].
```

**NOTE Section (Inheritance):**
```
Must/Inherits from `InterfaceName`.
[Additional behavioral expectation or constraint].
[Implementation detail or usage guidance].
```

## Key Terminology & Translation

### Port-Related Terms
| Japanese | English | Context |
|----------|---------|---------|
| ポート | port | Interface for a specific responsibility |
| 継承する | inherit | Interface inheritance relationship |
| 実装する | implement | Providing concrete implementation |
| ポートを継承する | inherits from | Explicit inheritance from another interface |
| ポートを実装する | implements | Concrete implementation of interface |

### Behavioral Expectations
| Japanese | English | Context |
|----------|---------|---------|
| 期待する | expect/expected to | Defines contract requirement |
| 保証する | ensure/guaranteed | System responsibility |
| 呼ばれる | called/invoked | Method execution |
| 返す | return/returns | Return value |
| 更新する | update/updates | State modification |

### Snapshot & State Management
| Japanese | English | Context |
|----------|---------|---------|
| スナップショット | snapshot | Capturing state at frame boundary |
| 内部状態 | internal state | Port's maintained value |
| 確定する | capture/confirm | Store value as snapshot |
| 保持する | maintain/hold | Keep state between calls |

### Simulation Concepts
| Japanese | English | Context |
|----------|---------|---------|
| シミュレーター | Simulator | Main execution engine |
| アクティブ | active | Currently processing/running |
| フレーム | frame | Single update cycle |
| ステップ | step | Fixed timestep update |
| ティック | tick | Single execution cycle (rarely used; use "frame" instead) |
| 演算 | computation/calculate | Physics calculation |
| 外部イベント | external event | DOM/user-triggered events |

### Object Identity
| Japanese | English | Context |
|----------|---------|---------|
| 同じオブジェクト参照 | same object reference | Identity equality (`===`) |
| `===` で等価 | equivalent by `===` | Object identity comparison |
| 配列オブジェクト | array object | Concrete array instance |

## Constraint Language

### Mandatory Constraints
Use "must" for strict requirements:
- "Must inherit from `SnapshotPort`"
- "Must return the same object reference within a single tick"

### Behavioral Contracts
Use "expected to" for port implementations:
- "Expected to capture value and maintain as internal state"
- "Expected to return the captured value until next `snapshot()`"

### Permissions
Use "may" for optional behaviors:
- "May return the same reference across snapshots if content doesn't change"

## Port-Specific Patterns

### SnapshotPort (Base Contract)
- Emphasize timing: "when `snapshot(now)` is called"
- Clarify lifecycle: "until the next `snapshot()` is called"
- Note dependencies: "`dependencies()` ensures dependent ports are snapshotted first"

### Readable Ports (Value Contracts)
- State the snapshot capture timing explicitly
- Specify object reference constraints for methods returning objects
- Mention allowed optimizations (same reference reuse)

### Clock/Activity Ports (Lifecycle)
- Use inheritance relationship clarification
- Reference the broader execution model (Simulator behavior)

### Engine/Kinetics (Computation)
- Specify parameter meanings clearly
- Separate per-dimension operations from multi-dimensional behavior
- Note default implementations and extension points

## Template Examples

### Simple Property Port (e.g., ProgressReadablePort)
```markdown
## PURPOSE

A port providing a [type] value [between X and Y/for purpose].
Used to [when/for what].

| Property | Description |
| --- | --- |
| `property` | [Value range/meaning] |

## NOTE

Must inherit from `SnapshotPort`.
When `snapshot()` is called, the port must capture the value at that moment and maintain it internally, ensuring that `property` does not change until the next `snapshot()`.
```

### Method-Based Port (e.g., VectorReadablePort)
```markdown
## PURPOSE

A port providing [description of what/how many dimensions].
Used [when/context of use].

| Method | Description |
| --- | --- |
| `method()` | Returns [what at when] |

## NOTE

Must inherit from `SnapshotPort`.
When `snapshot()` is called, the port must capture the [value type] at that moment and maintain it internally.
Within a single tick, `method()` must return the same [object type] (equivalent by `===`).
If [conditions], the same reference may be returned across multiple snapshots.
```

### Processing Port (e.g., EnginePort)
```markdown
## PURPOSE

A port to [responsibility].
[Context of invocation in simulator/pipeline].

| Parameter | Description |
| --- | --- |
| `param` | [Meaning/type] |

## NOTE

[Implementation guidance/extension points].
[Related patterns or alternatives].
```

## Common Mistakes to Avoid

1. **Mixing descriptive and prescriptive language**: Always use "must/should", not "is/does"
2. **Vague timing references**: Always specify "when", "until", "after" explicitly
3. **Implicit constraints**: State all behavioral expectations explicitly
4. **Over-explaining implementation**: Keep to contracts, not internal details (except where revealing implementation is necessary for understanding)
5. **Inconsistent terminology**: Always use agreed English terms, even in context explanations

## Maintenance Notes

- When adding new port types, follow the closest matching template
- Validate all behavioral constraints are explicitly stated
- Ensure object reference identity (`===`) requirements are clearly mentioned for any method returning objects
- Cross-reference related ports using relative links `[PortName](./port-name-in-kebab-case)`
