// Utility functions for matching method display and descriptions

export type MatchingMethod = 'LOCAL' | 'COHERE' | 'OPENAI' | 'COHERE_RERANK' | 'QWEN' | 'QWEN_RERANK';

export const methodInfo = {
  LOCAL: {
    name: 'Local Matching',
    shortName: 'Local',
    description: 'Fast fuzzy string matching algorithm',
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-200',
    processingMessage: 'Using fuzzy matching algorithm...',
    completedMessage: 'Local fuzzy matching completed',
    icon: '⚡'
  },
  COHERE: {
    name: 'Cohere Hybrid',
    shortName: 'Cohere',
    description: 'AI embeddings with Rerank v3.5 for accuracy',
    color: 'text-purple-600',
    bgColor: 'bg-purple-50',
    borderColor: 'border-purple-200',
    processingMessage: 'Generating embeddings and reranking with Cohere AI...',
    completedMessage: 'Cohere hybrid matching completed',
    icon: '🔮'
  },
  OPENAI: {
    name: 'OpenAI GPT',
    shortName: 'OpenAI',
    description: 'GPT-powered semantic matching',
    color: 'text-green-600',
    bgColor: 'bg-green-50',
    borderColor: 'border-green-200',
    processingMessage: 'Processing with OpenAI GPT embeddings...',
    completedMessage: 'OpenAI matching completed',
    icon: '🤖'
  },
  COHERE_RERANK: {
    name: 'Cohere Rerank v3.5',
    shortName: 'Rerank',
    description: 'Direct reranking with Cohere v3.5 model',
    color: 'text-indigo-600',
    bgColor: 'bg-indigo-50',
    borderColor: 'border-indigo-200',
    processingMessage: 'Reranking candidates with Cohere v3.5...',
    completedMessage: 'Cohere reranking completed',
    icon: '🎯'
  },
  QWEN: {
    name: 'Qwen Hybrid',
    shortName: 'Qwen',
    description: 'Cohere embeddings + Qwen3-8B reranking',
    color: 'text-orange-600',
    bgColor: 'bg-orange-50',
    borderColor: 'border-orange-200',
    processingMessage: 'Finding candidates with embeddings, reranking with Qwen3-8B...',
    completedMessage: 'Qwen hybrid matching completed',
    icon: '🔄'
  },
  QWEN_RERANK: {
    name: 'Qwen Direct',
    shortName: 'Qwen3',
    description: 'Direct Qwen3-8B reranking via DeepInfra',
    color: 'text-red-600',
    bgColor: 'bg-red-50',
    borderColor: 'border-red-200',
    processingMessage: 'Processing with Qwen3-8B model on DeepInfra...',
    completedMessage: 'Qwen3 reranking completed',
    icon: '🚀'
  }
};

export function getMethodInfo(method: MatchingMethod) {
  return methodInfo[method] || methodInfo.LOCAL;
}

export function getMethodDisplayName(method: MatchingMethod): string {
  return methodInfo[method]?.name || method;
}

export function getMethodShortName(method: MatchingMethod): string {
  return methodInfo[method]?.shortName || method;
}

export function getMethodDescription(method: MatchingMethod): string {
  return methodInfo[method]?.description || 'Unknown matching method';
}

export function getMethodProcessingMessage(method: MatchingMethod, progress?: number): string {
  const info = getMethodInfo(method);
  if (progress !== undefined && progress > 0) {
    return `${info.processingMessage} (${progress}% complete)`;
  }
  return info.processingMessage;
}

export function getMethodIcon(method: MatchingMethod): string {
  return methodInfo[method]?.icon || '📊';
}

export function isAIMethod(method: string): boolean {
  return ['COHERE', 'OPENAI', 'COHERE_RERANK', 'QWEN', 'QWEN_RERANK'].includes(method);
}

export function getMethodBadgeProps(method: MatchingMethod) {
  const info = getMethodInfo(method);
  return {
    className: `${info.bgColor} ${info.color} ${info.borderColor} border`,
    variant: 'outline' as const
  };
}

// Generate appropriate log messages based on method and stage
export function generateLogMessage(method: MatchingMethod, stage: 'start' | 'processing' | 'batch' | 'complete' | 'error', details?: any): string {
  const info = getMethodInfo(method);
  
  switch (stage) {
    case 'start':
      return `Starting ${info.name} matching process...`;
    
    case 'processing':
      if (details?.batch && details?.total) {
        if (method === 'COHERE_RERANK') {
          return `Reranking batch ${details.batch}/${details.total} with Cohere v3.5...`;
        } else if (method === 'QWEN' || method === 'QWEN_RERANK') {
          return `Processing batch ${details.batch}/${details.total} with Qwen3-8B model...`;
        } else if (method === 'COHERE') {
          return `Generating embeddings for batch ${details.batch}/${details.total}...`;
        } else if (method === 'OPENAI') {
          return `Processing batch ${details.batch}/${details.total} with GPT embeddings...`;
        }
      }
      return info.processingMessage;
    
    case 'batch':
      if (details?.items) {
        return `Processing ${details.items} items in current batch...`;
      }
      return 'Processing batch...';
    
    case 'complete':
      if (details?.matched && details?.total) {
        return `${info.completedMessage} - Matched ${details.matched}/${details.total} items`;
      }
      return info.completedMessage;
    
    case 'error':
      if (details?.message) {
        return `Error in ${info.shortName}: ${details.message}`;
      }
      return `Error occurred during ${info.name} matching`;
    
    default:
      return `${info.name} processing...`;
  }
}

// Format confidence score for display
export function formatConfidence(confidence: number, method: MatchingMethod): string {
  const percentage = Math.round(confidence * 100);
  
  if (method === 'LOCAL') {
    // Fuzzy matching score
    if (percentage >= 90) return `${percentage}% (Exact)`;
    if (percentage >= 70) return `${percentage}% (Good)`;
    if (percentage >= 50) return `${percentage}% (Fair)`;
    return `${percentage}% (Weak)`;
  } else if (method === 'COHERE_RERANK' || method === 'QWEN_RERANK') {
    // Reranking score
    if (percentage >= 80) return `${percentage}% (High)`;
    if (percentage >= 60) return `${percentage}% (Medium)`;
    if (percentage >= 40) return `${percentage}% (Low)`;
    return `${percentage}% (Very Low)`;
  } else {
    // Embedding similarity
    if (percentage >= 85) return `${percentage}% (Excellent)`;
    if (percentage >= 70) return `${percentage}% (Good)`;
    if (percentage >= 55) return `${percentage}% (Fair)`;
    return `${percentage}% (Poor)`;
  }
}