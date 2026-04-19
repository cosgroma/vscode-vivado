export enum VivadoRunType {
    Synthesis = 'synthesis',
    Implementation = 'implementation',
    Simulation = 'simulation',
    Other = 'other',
}

export enum VivadoRunStatus {
    NotStarted = 'not-started',
    Running = 'running',
    Complete = 'complete',
    Failed = 'failed',
    Unknown = 'unknown',
}

export interface VivadoRunOptions {
    name: string;
    type: VivadoRunType;
    status?: VivadoRunStatus;
    strategy?: string;
    parentRunName?: string;
}

export class VivadoRun {
    public name: string;
    public type: VivadoRunType;
    public status: VivadoRunStatus;
    public strategy?: string;
    public parentRunName?: string;

    constructor(options: VivadoRunOptions) {
        this.name = options.name;
        this.type = options.type;
        this.status = options.status ?? VivadoRunStatus.Unknown;
        this.strategy = options.strategy;
        this.parentRunName = options.parentRunName;
    }
}
