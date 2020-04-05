import { MicroModule, Dictionary, Constructor } from '@uprtcl/micro-orchestrator';
import { GraphQlSchemaModule } from '@uprtcl/graphql';
import { PatternsModule, Hashed, Pattern } from '@uprtcl/cortex';
import { SourcesModule } from '@uprtcl/multiplatform';

import { mockSchema } from './mock.schema';
import { MockPattern } from './mock.pattern';
import { MockSource } from './mock.source';
import { MockElement } from './mock-element';

export class MockModule extends MicroModule {
  constructor(
    protected initialObjects: Dictionary<Hashed<any>>,
    protected initialPatterns: Array<Constructor<Pattern>> = []
  ) {
    super();
  }
  
  async onLoad() {
    customElements.define('mock-element', MockElement)
  }

  submodules = [
    new GraphQlSchemaModule(mockSchema),
    new PatternsModule({ mock: [MockPattern, ...this.initialPatterns] }),
    new SourcesModule([
      { source: new MockSource(this.initialObjects), symbol: Symbol('mock-source') }
    ])
  ];
}
