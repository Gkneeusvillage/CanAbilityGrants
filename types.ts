export interface WebSource {
    uri?: string;
    title?: string;
}

export interface GroundingChunk {
    web?: WebSource;
}

export interface GroundingMetadata {
    groundingChunks?: GroundingChunk[];
}

export interface Candidate {
    content?: {
        parts?: { text?: string }[];
    };
    groundingMetadata?: GroundingMetadata;
}

export interface GenerateContentResponse {
    candidates?: Candidate[];
    text: string;
}

export interface ChatMessage {
    id: string;
    role: 'user' | 'model';
    text: string;
    groundingChunks?: GroundingChunk[];
    isStreaming?: boolean;
    hasError?: boolean;
}

export interface QuickOption {
    id: string;
    label: string;
    value: string;
}