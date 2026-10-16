declare module 'heti/js/heti-addon.js' {
  export default class Heti {
    constructor(rootSelector?: string);
    autoSpacing(): void;
    spacingElement(el: Element): void;
  }
}
