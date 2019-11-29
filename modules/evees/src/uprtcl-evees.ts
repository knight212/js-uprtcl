// Required by inversify
import 'reflect-metadata';

/** Types */
export { Commit, Perspective, Context, EveesTypes, PerspectiveDetails } from './types';

/** Services interfaces */
export { EveesSource } from './services/evees.source';
export { EveesProvider } from './services/evees.provider';
export { EveesRemote } from './services/evees.remote';
export { EveesDexie } from './services/providers/evees.dexie';

/** Service providers */
export { EveesHolochain } from './services/providers/holochain/evees.holochain';
export { EveesEthereum } from './services/providers/ethereum/evees.ethereum';
export { EveesHttp } from './services/providers/http/evees.http';

export { eveesModule } from './evees.module';
export { Evees } from './services/evees'
