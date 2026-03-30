import type { SimulationState } from "../domain/models/simulation-state";
import type { PhysicsPort } from "../domain/ports";
import type { DomPhysicsSource } from "./contracts/dom-physics-source";

type StyleRecipe = {
  transform: string[];
  filter: string[];
  backdropFilter: string[];
  styles: Partial<CSSStyleDeclaration>;
};

type StyleRecipeMapper = (st: SimulationState, recipe: StyleRecipe) => void;

export class DomVisualizer {
  constructor(
    private readonly mappers: readonly StyleRecipeMapper[] = [],
    private readonly useDefaultTranslate: boolean = true,
  ) {}

  public add(mapper: StyleRecipeMapper) {
    return new DomVisualizer([...this.mappers, mapper], this.useDefaultTranslate);
  }

  public noTranslate() {
    return new DomVisualizer([...this.mappers], false);
  }

  public opaticy(mapper: (state: SimulationState) => string | number) {
    return this.add((state, recipe) => {
      recipe.styles.opacity = mapper(state).toString();
    });
  }

  public zIndex(mapper: (state: SimulationState) => string | number) {
    return this.add((state, recipe) => {
      recipe.styles.zIndex = mapper(state).toString();
    });
  }

  public blur(mapper: (state: SimulationState) => string | number) {
    return this.add((state, recipe) => {
      const v = mapper(state);
      recipe.filter.push(typeof v === "number" ? `blur(${v}px)` : `blur(${v})`);
    });
  }

  public scale(mapper: (state: SimulationState) => string | number) {
    return this.add((state, recipe) => {
      recipe.transform.push(`scale(${mapper(state)})`);
    });
  }

  public calculate(state: SimulationState) {
    const recipe: StyleRecipe = {
      transform: [],
      filter: [],
      backdropFilter: [],
      styles: {},
    };

    if (this.useDefaultTranslate && state.relative.length >= 2) {
      const x = Math.round(state.relative[0] * 10) / 10;
      const y = Math.round(state.relative[1] * 10) / 10;
      recipe.transform.push(`translate3d(${x}px, ${y}px, 0)`);
    }

    for (const mapper of this.mappers) {
      mapper(state, recipe);
    }

    const result = recipe.styles;

    if (!result.transform && recipe.transform.length) {
      result.transform = recipe.transform.join(" ");
    }
    if (!result.filter && recipe.filter.length) {
      result.filter = recipe.filter.join(" ");
    }
    if (!result.backdropFilter && recipe.backdropFilter.length) {
      result.backdropFilter = recipe.backdropFilter.join(" ");
    }

    return result;
  }
}

export class ElementPhysics implements PhysicsPort {
  constructor(
    private readonly element: HTMLElement,
    private readonly visualizer = new DomVisualizer(),
  ) {}
  public apply(state: SimulationState) {
    const style = this.visualizer.calculate(state);
    for (const [key, val] of Object.entries(style)) {
      // biome-ignore lint/suspicious/noExplicitAny: CSSStyleDeclarationの型定義が厳しすぎるため、anyでキャストして代入する
      (this.element.style as any)[key] = val ?? "";
    }
  }
}

/**
 * @deprecated 依存関係複雑のため。DomSourceの非推奨のため。
 */
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
