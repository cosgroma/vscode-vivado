import { vivadoBitstreamActionDefinition } from './generate-bitstream';
import { VivadoTclActionDefinition } from './run-command';
import { vivadoImplementationActionDefinition } from './run-implementation';
import { vivadoSynthesisActionDefinition } from './run-synthesis';

export const vivadoBuildTclActionDefinitions: readonly VivadoTclActionDefinition[] = [
    vivadoSynthesisActionDefinition,
    vivadoImplementationActionDefinition,
    vivadoBitstreamActionDefinition,
];
