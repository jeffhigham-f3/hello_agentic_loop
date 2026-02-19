import type { ModelTarget } from "../types.js";

export interface ModelRouter {
  getRoute(): ModelTarget[];
}

export class StaticModelRouter implements ModelRouter {
  private readonly route: ModelTarget[];

  constructor(primary: ModelTarget, fallbacks: ModelTarget[]) {
    this.route = [primary, ...fallbacks];
  }

  getRoute(): ModelTarget[] {
    return this.route;
  }
}
