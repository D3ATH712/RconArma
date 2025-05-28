import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Upload, CheckCircle, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface MigrationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MigrationModal({ open, onOpenChange }: MigrationModalProps) {
  const [currentStep, setCurrentStep] = useState(1);
  const [uploadProgress, setUploadProgress] = useState(0);
  const { toast } = useToast();

  const steps = [
    { id: 1, name: 'Upload Code', description: 'Upload your bot files' },
    { id: 2, name: 'Configure', description: 'Configure settings' },
    { id: 3, name: 'Deploy', description: 'Deploy your bot' },
  ];

  const features = [
    'Discord.js Integration',
    'RCON Commands',
    'Multi-Guild Support',
    'JSON Configuration',
  ];

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // Simulate upload progress
      let progress = 0;
      const interval = setInterval(() => {
        progress += 10;
        setUploadProgress(progress);
        if (progress >= 100) {
          clearInterval(interval);
          setCurrentStep(2);
          toast({
            title: "Upload Complete",
            description: "Your bot files have been uploaded successfully.",
          });
        }
      }, 200);
    }
  };

  const handleProceed = () => {
    if (currentStep < 3) {
      setCurrentStep(currentStep + 1);
    } else {
      // Final deployment
      toast({
        title: "Migration Started",
        description: "Your bot migration is now in progress.",
      });
      onOpenChange(false);
      setCurrentStep(1);
      setUploadProgress(0);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>Bot Migration Wizard</DialogTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onOpenChange(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>

        <div className="space-y-6">
          {/* Step Indicator */}
          <div className="flex items-center justify-between">
            {steps.map((step, index) => (
              <div key={step.id} className="flex items-center">
                <div className="flex items-center">
                  <div
                    className={`rounded-full h-8 w-8 flex items-center justify-center text-sm font-medium ${
                      step.id <= currentStep
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-200 text-gray-600'
                    }`}
                  >
                    {step.id < currentStep ? (
                      <CheckCircle className="h-4 w-4" />
                    ) : (
                      step.id
                    )}
                  </div>
                  <div className="ml-2 text-sm font-medium">
                    {step.name}
                  </div>
                </div>
                {index < steps.length - 1 && (
                  <div className="flex-1 mx-4 h-0.5 bg-gray-200" />
                )}
              </div>
            ))}
          </div>

          {/* Step Content */}
          {currentStep === 1 && (
            <div className="space-y-4">
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-gray-400 transition-colors">
                <Upload className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                <p className="text-gray-600 mb-2">Drop your bot files here or click to browse</p>
                <p className="text-sm text-gray-500 mb-4">Supports .zip files up to 50MB</p>
                <input
                  type="file"
                  accept=".zip"
                  onChange={handleFileUpload}
                  className="hidden"
                  id="file-upload"
                />
                <Button asChild>
                  <label htmlFor="file-upload" className="cursor-pointer">
                    Select Files
                  </label>
                </Button>
              </div>

              {uploadProgress > 0 && (
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Uploading...</span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <Progress value={uploadProgress} className="h-2" />
                </div>
              )}
            </div>
          )}

          {currentStep === 2 && (
            <div className="space-y-4">
              <div className="bg-gray-50 rounded-lg p-4">
                <h4 className="font-medium text-gray-900 mb-3">Detected Features</h4>
                <div className="grid grid-cols-2 gap-2">
                  {features.map((feature) => (
                    <div key={feature} className="flex items-center text-sm text-gray-600">
                      <CheckCircle className="h-4 w-4 text-green-600 mr-2" />
                      {feature}
                    </div>
                  ))}
                </div>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="text-sm font-medium text-gray-700">Bot Name</label>
                  <input
                    type="text"
                    className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
                    placeholder="Enter bot name"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Environment</label>
                  <select className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2">
                    <option>Production</option>
                    <option>Development</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {currentStep === 3 && (
            <div className="space-y-4">
              <div className="text-center">
                <CheckCircle className="mx-auto h-16 w-16 text-green-600 mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">Ready to Deploy</h3>
                <p className="text-gray-600">Your bot configuration has been validated and is ready for deployment.</p>
              </div>
              <div className="bg-blue-50 rounded-lg p-4">
                <h4 className="font-medium text-blue-900 mb-2">Deployment Summary</h4>
                <ul className="text-sm text-blue-800 space-y-1">
                  <li>• PostgreSQL database will be created</li>
                  <li>• Existing configurations will be migrated</li>
                  <li>• Bot will be deployed with zero downtime</li>
                  <li>• Health monitoring will be enabled</li>
                </ul>
              </div>
            </div>
          )}

          {/* Detected Features (shown on step 1) */}
          {currentStep === 1 && uploadProgress === 0 && (
            <div className="bg-gray-50 rounded-lg p-4">
              <h4 className="font-medium text-gray-900 mb-3">Expected Features</h4>
              <div className="grid grid-cols-2 gap-2">
                {features.map((feature) => (
                  <div key={feature} className="flex items-center text-sm text-gray-600">
                    <CheckCircle className="h-4 w-4 text-green-600 mr-2" />
                    {feature}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex justify-between">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleProceed}
              disabled={currentStep === 1 && uploadProgress === 0}
            >
              {currentStep === 3 ? 'Deploy Bot' : 'Continue'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
