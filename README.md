<h1 align="center">chrono-kinesis</h1>
<h3 align="center">
  An open source animation library<br />for JavaScript
</h3>

<p align="center">
  <a href="https://www.npmjs.com/package/@yyyoichi/chrono-kinesis" rel="noopener noreferrer nofollow" ><img src="https://img.shields.io/npm/v/@yyyoichi/chrono-kinesis?color=0368FF&label=version" alt="npm version"></a>
  <img alt="NPM License" src="https://img.shields.io/npm/l/@yyyoichi/chrono-kinesis?color=FF2B6E">
</p>

```bash
npm install @yyyoichi/chrono-kinesis
```

<p align="center">
  Currently in development: v0.x.x
</p>

## Concepts

- **Declarative APIs**: Define when, where, and how motion should happen through an intuitive, declarative API design.
- **Optimized requestAnimationFrame scheduling**: Motion is triggered by standard Web API events such as click, hover, intersection, and resize.
- **Swappable motion engines**: Supports spring and linear motion engines, and applies not only to translate but also to opacity and user-defined CSS properties.
- **Rich examples**: Includes practical examples such as modal dialogs and drag-and-drop, with the goal of providing a broad set of real-world patterns.

## Architecture

```typescript
const simulation = new Simulator();
const context: SimulationContext = {
  clock: , // When
  target: , // Where
  kinetics: , // How
  physics: , // What
};
simulation.add(context);
simulation.run();
```

`Simulator` acts as an orchestrator that controls `requestAnimationFrame` based on `SimulationContext`.

- **clock**: Defines when motion starts.
- **target**: Defines the destination position or vector.
- **kinetics**: Defines how motion progresses toward the target.
- **physics**: Defines where the computed motion result is applied (for example, an HTMLElement).

## Reference

https://chrono-kinesis.yyyoichi.com/

## LISENCE

MIT
