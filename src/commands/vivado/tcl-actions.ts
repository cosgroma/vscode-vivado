import { vivadoBitstreamActionDefinition } from './generate-bitstream';
import { vivadoCleanRunOutputsActionDefinition } from './clean-run-outputs';
import { VivadoTclActionDefinition } from './run-command';
import { vivadoImplementationActionDefinition } from './run-implementation';
import { vivadoResetRunActionDefinition } from './reset-run';
import { vivadoSynthesisActionDefinition } from './run-synthesis';

export const vivadoBuildTclActionDefinitions: readonly VivadoTclActionDefinition[] = [
    vivadoSynthesisActionDefinition,
    vivadoImplementationActionDefinition,
    vivadoBitstreamActionDefinition,
];

export const vivadoRunMaintenanceTclActionDefinitions: readonly VivadoTclActionDefinition[] = [
    vivadoResetRunActionDefinition,
    vivadoCleanRunOutputsActionDefinition,
];

export const vivadoTclActionDefinitions: readonly VivadoTclActionDefinition[] = [
    ...vivadoBuildTclActionDefinitions,
    ...vivadoRunMaintenanceTclActionDefinitions,
];
