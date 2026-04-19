export type VivadoDiagnosticSeverity = 'error' | 'warning' | 'info';

export interface VivadoDiagnosticMessage {
    severity: VivadoDiagnosticSeverity;
    rawSeverity: string;
    code: string;
    message: string;
    filePath: string;
    line: number;
    column?: number;
}

export const vivadoDiagnosticLinePattern = /^(?:(CRITICAL)\s+)?(ERROR|WARNING|INFO):\s+\[([^\]]+)\]\s*(.*?)\s+\[(.+?):(\d+)(?::(\d+))?\]\s*$/;

export function parseVivadoDiagnosticLine(line: string): VivadoDiagnosticMessage | undefined {
    const match = line.match(vivadoDiagnosticLinePattern);
    if (!match) {
        return undefined;
    }

    const critical = match[1];
    const severity = match[2];
    const lineNumber = Number.parseInt(match[6], 10);
    const column = match[7] ? Number.parseInt(match[7], 10) : undefined;

    if (!Number.isInteger(lineNumber) || lineNumber < 1 || (column !== undefined && (!Number.isInteger(column) || column < 1))) {
        return undefined;
    }

    return {
        severity: normalizeVivadoSeverity(severity),
        rawSeverity: critical ? `${critical} ${severity}` : severity,
        code: match[3].trim(),
        message: match[4].trim(),
        filePath: match[5],
        line: lineNumber,
        column,
    };
}

export function parseVivadoDiagnosticLines(lines: readonly string[]): VivadoDiagnosticMessage[] {
    return lines
        .map(parseVivadoDiagnosticLine)
        .filter((message): message is VivadoDiagnosticMessage => message !== undefined);
}

function normalizeVivadoSeverity(severity: string): VivadoDiagnosticSeverity {
    switch (severity) {
        case 'ERROR':
            return 'error';
        case 'INFO':
            return 'info';
        default:
            return 'warning';
    }
}
