import { toast } from 'react-hot-toast';

export const useToast = () => {
  return {
    toast: (options: { title: string; description?: string; variant?: 'default' | 'destructive' }) => {
      if (options.variant === 'destructive') {
        toast.error(`${options.title}${options.description ? `\n${options.description}` : ''}`);
      } else {
        toast.success(`${options.title}${options.description ? `\n${options.description}` : ''}`);
      }
    }
  };
};