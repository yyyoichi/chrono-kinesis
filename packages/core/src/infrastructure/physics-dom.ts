import type { SimulationState } from "../domain/models/simulation-state";
import type { PhysicsPort } from "../domain/ports";
import type { DomPhysicsSource } from "./contracts/dom-physics-source";

type StyleRecipe = {
  transform?: CSSStyleDeclaration["transform"][];
  filter?: CSSStyleDeclaration["filter"][];
  backdropFilter?: CSSStyleDeclaration["backdropFilter"][];
  styles?: Partial<CSSStyleDeclaration>;
};

type StyleRecipeMapper = (st: SimulationState) => StyleRecipe;

export class DomVisualizer {
  constructor(
    private readonly mappers: readonly StyleRecipeMapper[] = [],
    private readonly useDefaultTranslate: boolean = true,
  ) {}

  public add(mapper: StyleRecipeMapper) {
    return new DomVisualizer(
      [...this.mappers, mapper],
      this.useDefaultTranslate,
    );
  }

  public noTranslate() {
    return new DomVisualizer([...this.mappers], false);
  }

  public opaticy(mapper: (state: SimulationState) => string | number) {
    return this.add((state) => ({
      styles: {
        opacity: mapper(state).toString(),
      },
    }));
  }

  public zIndex(mapper: (state: SimulationState) => string | number) {
    return this.add((state) => ({
      styles: {
        zIndex: mapper(state).toString(),
      },
    }));
  }

  public blur(mapper: (state: SimulationState) => string | number) {
    return this.add((state) => {
      const v = mapper(state);
      return {
        filter: [typeof v === "number" ? `blur(${v}px)` : `blur(${v})`],
      };
    });
  }

  public scale(mapper: (state: SimulationState) => string | number) {
    return this.add((state) => ({ transform: [`scale(${mapper(state)})`] }));
  }

  public calculate(state: SimulationState) {
    const transforms: string[] = [];
    const filters: string[] = [];
    const backdropFilters: string[] = [];
    const styles: Partial<CSSStyleDeclaration> = {};

    if (this.useDefaultTranslate && state.relative.length >= 2) {
      const x = Math.round(state.relative[0] * 10) / 10;
      const y = Math.round(state.relative[1] * 10) / 10;
      transforms.push(`translate3d(${x}px, ${y}px, 0)`);
    }

    for (const mapper of this.mappers) {
      const r = mapper(state);
      if (r.transform) {
        transforms.push(...r.transform);
      }
      if (r.filter) {
        filters.push(...r.filter);
      }
      if (r.backdropFilter) {
        backdropFilters.push(...r.backdropFilter);
      }
      if (r.styles) {
        Object.assign(styles, r.styles);
      }
    }

    if (!styles.transform && transforms.length) {
      styles.transform = transforms.join(" ");
    }
    if (!styles.filter && filters.length) {
      styles.filter = filters.join(" ");
    }
    if (!styles.backdropFilter && backdropFilters.length) {
      styles.backdropFilter = backdropFilters.join(" ");
    }

    return styles;
  }
}

export class DomPhysics implements PhysicsPort {
  constructor(
    private readonly source: DomPhysicsSource,
    private visualizer: DomVisualizer,
  ) {}

  public apply(state: SimulationState) {
    const style = this.visualizer.calculate(state);
    this.source.apply(style);
  }
}
