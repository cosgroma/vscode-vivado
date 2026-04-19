import { VivadoFile, VivadoFileKind } from './vivado-file';

export enum VivadoFilesetKind {
    Sources = 'sources',
    Simulation = 'simulation',
    Constraints = 'constraints',
    Other = 'other',
}

export interface VivadoFilesetOptions {
    name: string;
    kind: VivadoFilesetKind;
    files?: VivadoFile[];
}

export class VivadoFileset {
    public name: string;
    public kind: VivadoFilesetKind;
    public files: VivadoFile[];

    constructor(options: VivadoFilesetOptions) {
        this.name = options.name;
        this.kind = options.kind;
        this.files = options.files ?? [];
    }

    public get designSources(): VivadoFile[] {
        return this.files.filter(file => file.kind === VivadoFileKind.DesignSource);
    }

    public get simulationSources(): VivadoFile[] {
        return this.files.filter(file => file.kind === VivadoFileKind.SimulationSource);
    }

    public get constraints(): VivadoFile[] {
        return this.files.filter(file => file.kind === VivadoFileKind.Constraint);
    }
}
