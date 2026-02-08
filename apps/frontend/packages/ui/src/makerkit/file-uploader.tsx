import { type PresignedUpload, useS3Upload } from '../hooks/use-s3-upload';
import { cn } from '../lib/utils/cn';
import { Dropzone, DropzoneContent, DropzoneEmptyState } from './dropzone';

export const FileUploader = (props: {
  className?: string;
  maxFiles: number;
  path?: string;
  allowedMimeTypes: string[];
  maxFileSize: number | undefined;
  cacheControl?: number;
  onUploadSuccess?: (files: PresignedUpload[]) => void;
}) => {
  const uploader = useS3Upload(props);

  return (
    <div className={cn(props.className)}>
      <Dropzone {...uploader}>
        <DropzoneEmptyState />
        <DropzoneContent />
      </Dropzone>
    </div>
  );
};
