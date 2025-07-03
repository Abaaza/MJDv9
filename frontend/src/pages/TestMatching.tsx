import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { api } from '../lib/api';
import { toast } from 'react-hot-toast';
import { Loader2, CheckCircle, XCircle, Zap, Globe, Brain, Shuffle, Cpu, Ruler, Layers } from 'lucide-react';

interface MethodResult {
  success: boolean;
  duration: string;
  result?: {
    matchedDescription: string;
    confidence: number;
    matchedRate: number;
    matchedUnit: string;
    matchedCode: string;
  };
  error?: string;
}

interface TestResults {
  [key: string]: MethodResult;
}

const methodIcons = {
  LOCAL: <Zap className="h-4 w-4" />,
  LOCAL_UNIT: <Ruler className="h-4 w-4" />,
  COHERE: <Globe className="h-4 w-4" />,
  OPENAI: <Brain className="h-4 w-4" />,
  HYBRID: <Shuffle className="h-4 w-4" />,
  HYBRID_CATEGORY: <Layers className="h-4 w-4" />,
  ADVANCED: <Cpu className="h-4 w-4" />
};

const methodDescriptions = {
  LOCAL: "Fast fuzzy matching using local algorithms",
  LOCAL_UNIT: "Local matching with unit compatibility priority",
  COHERE: "AI-powered semantic matching using Cohere embeddings",
  OPENAI: "AI-powered semantic matching using OpenAI embeddings",
  HYBRID: "Combines all methods and returns best match",
  HYBRID_CATEGORY: "Hybrid matching with category emphasis",
  ADVANCED: "Multi-stage matching with enhanced algorithms"
};

export default function TestMatching() {
  const [description, setDescription] = useState("Excavation in soil not exceeding 2m deep");
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<TestResults | null>(null);
  const [priceItemCount, setPriceItemCount] = useState<number>(0);

  const testAllMethods = async () => {
    try {
      setIsLoading(true);
      setResults(null);
      
      const response = await api.get('/test/test-all-methods', {
        params: { description }
      });
      
      setResults(response.data.results);
      setPriceItemCount(response.data.priceItemCount);
      toast.success('All methods tested successfully');
      
    } catch (error: any) {
      console.error('Test failed:', error);
      toast.error(error.response?.data?.error || 'Test failed');
    } finally {
      setIsLoading(false);
    }
  };

  const testSingleMethod = async (method: string) => {
    try {
      setIsLoading(true);
      
      const response = await api.post('/test/test-method', {
        method,
        description
      });
      
      setResults({
        ...results,
        [method]: {
          success: true,
          duration: response.data.duration,
          result: response.data.result
        }
      });
      
      toast.success(`${method} tested successfully`);
      
    } catch (error: any) {
      console.error(`${method} test failed:`, error);
      
      setResults({
        ...results,
        [method]: {
          success: false,
          duration: '0ms',
          error: error.response?.data?.details || error.message
        }
      });
      
      toast.error(`${method} test failed`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Test Matching Methods</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <Label htmlFor="description">Test Description</Label>
              <Input
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Enter a description to test matching"
                className="mt-1"
              />
            </div>
            
            <div className="flex gap-2">
              <Button 
                onClick={testAllMethods} 
                disabled={isLoading || !description}
                className="flex-1"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Testing...
                  </>
                ) : (
                  'Test All Methods'
                )}
              </Button>
            </div>

            {priceItemCount > 0 && (
              <p className="text-sm text-muted-foreground">
                Testing against {priceItemCount.toLocaleString()} price items
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {results && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Object.entries(results).map(([method, result]) => (
            <Card key={method} className={result.success ? '' : 'border-red-500'}>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    {methodIcons[method as keyof typeof methodIcons]}
                    {method}
                  </span>
                  {result.success ? (
                    <CheckCircle className="h-4 w-4 text-green-500" />
                  ) : (
                    <XCircle className="h-4 w-4 text-red-500" />
                  )}
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-1">
                  {methodDescriptions[method as keyof typeof methodDescriptions]}
                </p>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Duration:</span>
                  <span className="font-medium">{result.duration}</span>
                </div>
                
                {result.success && result.result ? (
                  <>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Confidence:</span>
                      <span className={`font-medium ${
                        result.result.confidence > 0.8 ? 'text-green-600' :
                        result.result.confidence > 0.6 ? 'text-yellow-600' :
                        'text-red-600'
                      }`}>
                        {(result.result.confidence * 100).toFixed(1)}%
                      </span>
                    </div>
                    
                    <div className="mt-3 pt-3 border-t">
                      <p className="text-xs font-medium mb-1">Matched Item:</p>
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        {result.result.matchedDescription}
                      </p>
                      <div className="flex gap-2 mt-2 text-xs">
                        <span className="text-muted-foreground">Rate:</span>
                        <span className="font-medium">{result.result.matchedRate}</span>
                        <span className="text-muted-foreground">Unit:</span>
                        <span className="font-medium">{result.result.matchedUnit}</span>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="text-sm text-red-600">
                    Error: {result.error || 'Unknown error'}
                  </div>
                )}
                
                {!isLoading && (
                  <Button 
                    size="sm" 
                    variant="outline" 
                    className="w-full mt-2"
                    onClick={() => testSingleMethod(method)}
                  >
                    Retest {method}
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}