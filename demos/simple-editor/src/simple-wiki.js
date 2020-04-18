import { LitElement, html, css } from 'lit-element';

import { moduleConnect } from '@uprtcl/micro-orchestrator';
import { EveesModule, CREATE_PERSPECTIVE, CREATE_COMMIT, CREATE_ENTITY } from '@uprtcl/evees';
import { WikisModule } from '@uprtcl/wikis';
import { ApolloClientModule } from '@uprtcl/graphql';
import { HttpProviderModule } from '@uprtcl/http-provider';

export class SimpleWiki extends moduleConnect(LitElement) {
  static get properties() {
    return {
      rootHash: { type: String },
      loading: { type: Boolean, attribute: false },
      defaultAuthority: { type: String }
    };
  }

  constructor() {
    super();
    this.loading = true;
  }

  subscribeToHistory(history, callback) {
    const pushState = history.pushState;
    history.pushState = function(state) {
      if (typeof history.onpushstate == 'function') {
        history.onpushstate({ state: state });
      }
      callback(arguments);
      // Call your custom function here
      return pushState.apply(history, arguments);
    };
  }

  async firstUpdated() {
    this.addEventListener('evees-proposal-created', e => console.log(e));

    window.addEventListener('popstate', () => {
      this.rootHash = window.location.href.split('id=')[1];
    });

    this.subscribeToHistory(window.history, state => {
      this.rootHash = state[2].split('id=')[1];
    });

    const eveesHttpProvider = this.requestAll(EveesModule.bindings.EveesRemote).find(provider =>
      provider.authority.startsWith('http')
    );

    await eveesHttpProvider.connect();

    this.defaultAuthority = eveesHttpProvider.authority;

    if (window.location.href.includes('?id=')) {
      this.rootHash = window.location.href.split('id=')[1];
    } else {
      const eveesEthProvider = this.requestAll(EveesModule.bindings.EveesRemote).find(provider =>
        provider.authority.startsWith('eth')
      );

      const wikisProvider = this.requestAll(WikisModule.bindings.WikisRemote).find(provider =>
        provider.source.startsWith('ipfs')
      );

      const client = this.request(ApolloClientModule.bindings.Client);

      const createWiki = await client.mutate({
        mutation: CREATE_ENTITY,
        variables: {
          content: JSON.stringify({
            title: 'Genesis Wiki',
            pages: []
          }),
          source: wikisProvider.source
        }
      });

      const createCommit = await client.mutate({
        mutation: CREATE_COMMIT,
        variables: {
          dataId: createWiki.data.createEntity,
          parentsIds: [],
          source: eveesEthProvider.source
        }
      });

      const randint = 0 + Math.floor((10000 - 0) * Math.random());
  
      const createPerspective = await client.mutate({
        mutation: CREATE_PERSPECTIVE,
        variables: {
          headId: createCommit.data.createCommit.id,
          context: `genesis-dao-wiki-${randint}`,
          canWrite: '0xFFcf8FDEE72ac11b5c542428B35EEF5769C409f0',
          authority: eveesEthProvider.authority
        }
      });

      const perspectiveId = createPerspective.data.createPerspective.id;

      window.history.pushState('', '', `/?id=${perspectiveId}`);
    }

    this.loading = false;
  }

  render() {
    return html`
      ${!this.loading
        ? html`
            <div class="app-mock">
              <wiki-drawer ref=${this.rootHash} default-authority=${this.defaultAuthority}></wiki-drawer>
            </div>
          `
        : html`
            Loading...
          `}
    `;
  }

  static get styles() {
    return css`
    .app-mock {
      padding: 50px 80px;
      min-height: calc(100vh - 100px);
      display: flex;
      flex-direction: column;
      background-color: #bdc6e0;
    }`;
  }
}
