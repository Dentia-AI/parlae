import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  type FileError,
  type FileRejection,
  useDropzone,
} from 'react-dropzone';

export type FileWithPreview = File & {
  preview?: string;
  errors: readonly FileError[];
};

export type PresignedUpload = {
  uploadUrl: string;
  key: string;
  publicUrl: string;
};

export type UseS3UploadOptions = {
  path?: string;
  allowedMimeTypes?: string[];
  maxFileSize?: number;
  maxFiles?: number;
  cacheControl?: number;
  onUploadSuccess?: (uploads: PresignedUpload[]) => void;
};

export type UseS3UploadReturn = {
  files: FileWithPreview[];
  setFiles: Dispatch<SetStateAction<FileWithPreview[]>>;
  loading: boolean;
  errors: { name: string; message: string }[];
  successes: string[];
  maxFileSize: number;
  maxFiles: number;
  isSuccess: boolean;
  isDragActive: boolean;
  isDragReject: boolean;
  inputRef: ReturnType<typeof useDropzone>['inputRef'];
  getRootProps: ReturnType<typeof useDropzone>['getRootProps'];
  getInputProps: ReturnType<typeof useDropzone>['getInputProps'];
  onUpload: () => Promise<void>;
  onClear: () => void;
};

export function useS3Upload(options: UseS3UploadOptions = {}): UseS3UploadReturn {
  const {
    path,
    allowedMimeTypes = [],
    maxFileSize = Number.POSITIVE_INFINITY,
    maxFiles = 1,
    cacheControl = 3600,
    onUploadSuccess,
  } = options;

  const [files, setFiles] = useState<FileWithPreview[]>([]);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ name: string; message: string }[]>([]);
  const [successes, setSuccesses] = useState<Record<string, PresignedUpload>>({});

  const reset = useCallback(() => {
    setFiles([]);
    setErrors([]);
    setSuccesses({});
  }, []);

  const isSuccess = useMemo(() => {
    if (!files.length) return false;

    const successfulUploads = files.filter((file) => successes[file.name]);

    return successfulUploads.length === files.length && errors.length === 0;
  }, [files, successes, errors]);

  const onDrop = useCallback(
    (acceptedFiles: File[], rejected: FileRejection[]) => {
      setErrors([]);

      const nextFiles: FileWithPreview[] = [];

      const createPreview = (file: File, errs: readonly FileError[] = []) => {
        const withPreview = file as FileWithPreview;
        withPreview.preview = URL.createObjectURL(file);
        withPreview.errors = errs;
        return withPreview;
      };

      acceptedFiles.forEach((file) => {
        if (!files.some((current) => current.name === file.name)) {
          nextFiles.push(createPreview(file));
        }
      });

      rejected.forEach(({ file, errors }) => {
        nextFiles.push(createPreview(file, errors));
      });

      setFiles((prev) => [...prev, ...nextFiles]);
    },
    [files],
  );

  const dropzone = useDropzone({
    onDrop,
    noClick: true,
    accept: allowedMimeTypes.reduce<Record<string, string[]>>(
      (acc, type) => ({ ...acc, [type]: [] }),
      {},
    ),
    maxSize: maxFileSize,
    maxFiles,
    multiple: maxFiles !== 1,
  });

  useEffect(() => {
    return () => {
      files.forEach((file) => {
        if (file.preview) URL.revokeObjectURL(file.preview);
      });
    };
  }, [files]);

  const onUpload = useCallback(async () => {
    if (!files.length) return;

    setLoading(true);

    const response = await fetch('/api/uploads/presign', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        files: files.map((file) => ({
          name: file.name,
          type: file.type,
        })),
        path,
        cacheControl,
      }),
    });

    if (!response.ok) {
      setErrors([
        {
          name: 'global',
          message: 'Unable to request upload credentials.',
        },
      ]);
      setLoading(false);
      return;
    }

    const { uploads }: { uploads: PresignedUpload[] } = await response.json();

    const uploadResults = await Promise.all(
      files.map(async (file, index) => {
        const upload = uploads[index];

        if (!upload) {
          return {
            name: file.name,
            success: false,
            message: 'Upload configuration missing.',
          };
        }

        const uploadResponse = await fetch(upload.uploadUrl, {
          method: 'PUT',
          headers: {
            'Content-Type': file.type || 'application/octet-stream',
          },
          body: file,
        });

        if (!uploadResponse.ok) {
          return {
            name: file.name,
            success: false,
            message: `Upload failed with status ${uploadResponse.status}.`,
          };
        }

        return {
          name: file.name,
          success: true,
          upload,
        };
      }),
    );

    const failed = uploadResults.filter((result) => !result.success);

    setErrors(
      failed.map((item) => ({
        name: item.name,
        message: item.message ?? 'Upload failed.',
      })),
    );

    const successful = uploadResults.filter(
      (item): item is { name: string; success: true; upload: PresignedUpload } =>
        item.success,
    );

    if (successful.length) {
      const newSuccesses = successful.reduce<Record<string, PresignedUpload>>(
        (acc, current) => ({
          ...acc,
          [current.name]: current.upload,
        }),
        {},
      );

      setSuccesses((prev) => ({ ...prev, ...newSuccesses }));
      onUploadSuccess?.(successful.map((item) => item.upload));
    }

    setLoading(false);
  }, [files, path, cacheControl, onUploadSuccess]);

  return {
    files,
    setFiles,
    loading,
    errors,
    successes: Object.keys(successes),
    maxFileSize,
    maxFiles,
    isSuccess,
    isDragActive: dropzone.isDragActive,
    isDragReject: dropzone.isDragReject,
    inputRef: dropzone.inputRef,
    getRootProps: dropzone.getRootProps,
    getInputProps: dropzone.getInputProps,
    onUpload,
    onClear: reset,
  };
}
