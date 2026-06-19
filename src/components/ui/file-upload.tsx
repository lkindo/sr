'use client';

import { useCallback, useEffect, useId, useState } from 'react';
import { File, UploadCloud, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

function FilePreview({ file }: { file: File }) {
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    if (file.type.startsWith('image/')) {
      const url = URL.createObjectURL(file);
      setPreview(url);
      return () => URL.revokeObjectURL(url);
    }
    setPreview(null);
  }, [file]);

  if (preview) {
    return (
      <img
        src={preview}
        alt={file.name}
        className="h-10 w-10 object-cover rounded border bg-background flex-shrink-0"
      />
    );
  }

  return <File className="h-4 w-4 text-muted-foreground flex-shrink-0" />;
}

interface FileUploadProps {
  onChange: (files: File[]) => void;
  value: File[];
  maxSize?: number; // in MB
  maxFiles?: number;
  accept?: string;
  disabled?: boolean;
}

export function FileUpload({
  onChange,
  value,
  maxSize = 10,
  maxFiles = 5,
  accept = '*/*',
  disabled = false,
}: FileUploadProps) {
  const [dragActive, setDragActive] = useState(false);
  const descriptionId = useId();
  const { toast } = useToast();

  const handleFiles = useCallback(
    (files: File[]) => {
      // Check max files
      if (value.length + files.length > maxFiles) {
        toast({
          title: '업로드 제한',
          description: `최대 ${maxFiles}개의 파일만 업로드할 수 있습니다.`,
          variant: 'destructive',
        });
        return;
      }

      // Check file sizes
      const oversizedFiles = files.filter((file) => file.size > maxSize * 1024 * 1024);
      if (oversizedFiles.length > 0) {
        toast({
          title: '파일 크기 초과',
          description: `파일 크기는 ${maxSize}MB를 초과할 수 없습니다.`,
          variant: 'destructive',
        });
        return;
      }

      onChange([...value, ...files]);
    },
    [onChange, value, maxFiles, maxSize, toast]
  );

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragActive(false);

      if (disabled) return;

      const files = Array.from(e.dataTransfer.files);
      handleFiles(files);
    },
    [disabled, handleFiles]
  );

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const clipboardFiles = e.clipboardData.files;
      if (clipboardFiles.length > 0) {
        e.preventDefault();
        if (disabled) return;
        handleFiles(Array.from(clipboardFiles));
      }
    },
    [disabled, handleFiles]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      e.preventDefault();
      if (disabled) return;

      const files = e.target.files ? Array.from(e.target.files) : [];
      handleFiles(files);
    },
    [disabled, handleFiles]
  );

  const removeFile = (index: number) => {
    const newFiles = value.filter((_, i) => i !== index);
    onChange(newFiles);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  return (
    <div className="space-y-4">
      <div
        className={cn(
          'relative border-2 border-dashed rounded-[8px] p-8 text-center cursor-pointer transition-colors focus-within:ring-2 focus-within:ring-primary focus-within:ring-offset-2',
          dragActive
            ? 'border-primary bg-primary/10'
            : 'border-[#c7d2fe] bg-[#f8fafc] hover:border-primary/50',
          disabled && 'opacity-40 cursor-not-allowed'
        )}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onPaste={handlePaste}
      >
        <input
          type="file"
          multiple
          accept={accept}
          onChange={handleChange}
          disabled={disabled}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          aria-label="파일 업로드"
          aria-describedby={descriptionId}
          title="파일 업로드"
        />
        <div className="flex flex-col items-center gap-2">
          <UploadCloud className="h-8 w-8 text-muted-foreground" />
          <div className="text-sm">
            <span className="font-medium text-primary">클릭</span>, 드래그 또는 붙여넣기
          </div>
          <div id={descriptionId} className="text-xs text-muted-foreground">
            최대 {maxFiles}개, 파일당 {maxSize}MB 이하
          </div>
        </div>
      </div>

      {value.length > 0 && (
        <div className="space-y-2">
          <div className="text-sm font-medium">
            선택된 파일 ({value.length}/{maxFiles})
          </div>
          {value.map((file, index) => (
            <div key={index} className="flex items-center justify-between p-3 bg-muted rounded-lg">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <FilePreview file={file} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{file.name}</div>
                  <div className="text-xs text-muted-foreground">{formatFileSize(file.size)}</div>
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => removeFile(index)}
                disabled={disabled}
                className="flex-shrink-0"
                aria-label={`${file.name} 삭제`}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
