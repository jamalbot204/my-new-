
import { useState, useCallback } from 'react';
import { Attachment, AttachmentUploadState, LogApiRequestCallback } from '../types';
import { uploadFileViaApi } from '../services/geminiService';
import { SUPPORTED_IMAGE_MIME_TYPES, SUPPORTED_VIDEO_MIME_TYPES } from '../constants';

interface UseAttachmentHandlerProps {
  logApiRequestCallback: LogApiRequestCallback;
  isInfoInputModeActive: boolean;
}

export function useAttachmentHandler({
  logApiRequestCallback,
  isInfoInputModeActive,
}: UseAttachmentHandlerProps) {
  const [selectedFiles, setSelectedFiles] = useState<Attachment[]>([]);

  const updateAttachmentState = useCallback((id: string, updates: Partial<Attachment>) => {
    setSelectedFiles(prev => prev.map(f => f.id === id ? { ...f, ...updates } : f));
  }, []);

  const processCloudUpload = useCallback(async (file: File, attachmentId: string) => {
    updateAttachmentState(attachmentId, {
      uploadState: 'uploading_to_cloud',
      statusMessage: 'Initiating cloud upload...',
      isLoading: true,
      progress: undefined,
      error: undefined,
    });

    try {
      const uploadResult = await uploadFileViaApi(
        file,
        logApiRequestCallback,
        (state, fileApiNameFromCb, messageFromCb, progressFromCb) => {
          updateAttachmentState(attachmentId, {
            uploadState: state,
            statusMessage: messageFromCb || state.replace(/_/g, ' '),
            fileApiName: fileApiNameFromCb,
            progress: progressFromCb,
            isLoading: state === 'uploading_to_cloud' || state === 'processing_on_server',
          });
        }
      );

      if (uploadResult.error) {
        updateAttachmentState(attachmentId, {
          error: uploadResult.error,
          uploadState: 'error_cloud_upload',
          statusMessage: `Cloud Error: ${uploadResult.error}`,
          isLoading: false,
        });
      } else if (uploadResult.fileUri) {
        updateAttachmentState(attachmentId, {
          fileUri: uploadResult.fileUri,
          fileApiName: uploadResult.fileApiName,
          uploadState: 'completed_cloud_upload',
          statusMessage: 'Cloud upload complete. Ready.',
          isLoading: false,
          error: undefined,
        });
      }
    } catch (err: any) {
      updateAttachmentState(attachmentId, {
        error: err.message || "Cloud upload failed unexpectedly.",
        uploadState: 'error_cloud_upload',
        statusMessage: `Cloud Error: ${err.message || "Upload failed."}`,
        isLoading: false,
      });
    }
  }, [logApiRequestCallback, updateAttachmentState]);

  const handleFileSelection = useCallback((files: FileList | null) => {
    if (!files || isInfoInputModeActive) return;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      
      let fileTypeForApp: 'image' | 'video' = 'image'; 
      if (SUPPORTED_IMAGE_MIME_TYPES.includes(file.type)) {
          fileTypeForApp = 'image';
      } else if (SUPPORTED_VIDEO_MIME_TYPES.includes(file.type)) {
          fileTypeForApp = 'video';
      } 
      
      const attachmentId = `file-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const newAttachmentInitial: Attachment = {
          id: attachmentId,
          name: file.name,
          mimeType: file.type, 
          size: file.size,
          type: fileTypeForApp, 
          uploadState: 'reading_client',
          statusMessage: 'Reading file...',
          isLoading: true, 
      };
      
      setSelectedFiles(prev => [...prev, newAttachmentInitial]); 

      const reader = new FileReader();
      reader.onload = (e_reader) => {
          const fileContentResult = e_reader.target?.result as string;
          let rawBase64Data = '';
          let dataUrlForPreview: string | undefined = undefined;

          if (fileContentResult && fileContentResult.startsWith('data:')) {
              dataUrlForPreview = fileContentResult;
              const commaIndex = fileContentResult.indexOf(',');
              if (commaIndex !== -1) {
                  rawBase64Data = fileContentResult.substring(commaIndex + 1);
              } else {
                  console.error("Malformed data URL, no comma found for base64 extraction.");
                  rawBase64Data = ''; 
              }
          } else {
              console.error("FileReader did not return a Data URL as expected.");
                updateAttachmentState(attachmentId, {
                  error: "Failed to read file content correctly.",
                  uploadState: 'error_client_read',
                  statusMessage: 'Error reading file content.',
                  isLoading: false,
              });
              return;
          }
          
          updateAttachmentState(attachmentId, {
              base64Data: rawBase64Data,
              dataUrl: (fileTypeForApp === 'image' || fileTypeForApp === 'video') ? dataUrlForPreview : undefined,
              // Keep cloud state if already uploading/processed by cloud
              // This can happen if processCloudUpload was called before this onload finished (unlikely but possible)
              uploadState: ['uploading_to_cloud', 'processing_on_server', 'completed_cloud_upload'].includes(newAttachmentInitial.uploadState || '') 
                           ? newAttachmentInitial.uploadState 
                           : 'completed',
              statusMessage: ['uploading_to_cloud', 'processing_on_server', 'completed_cloud_upload'].includes(newAttachmentInitial.uploadState || '')
                           ? newAttachmentInitial.statusMessage
                           : 'Preview ready (if applicable), awaiting cloud sync.',
              isLoading: ['uploading_to_cloud', 'processing_on_server'].includes(newAttachmentInitial.uploadState || ''),
          });
          processCloudUpload(file, attachmentId);
      };
      reader.onerror = (e_reader) => {
          console.error("FileReader error:", e_reader);
          updateAttachmentState(attachmentId, {
              error: "Failed to read file for preview or base64.",
              uploadState: 'error_client_read',
              statusMessage: 'Error reading file.',
              isLoading: false, 
          });
      };
      reader.readAsDataURL(file); 
    }
  }, [processCloudUpload, isInfoInputModeActive, updateAttachmentState]);

  const handlePaste = useCallback((event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    if (isInfoInputModeActive) return;
    if (event.clipboardData.files && event.clipboardData.files.length > 0) {
      event.preventDefault();
      handleFileSelection(event.clipboardData.files);
    }
  }, [handleFileSelection, isInfoInputModeActive]);

  const removeSelectedFile = useCallback((id: string) => {
    setSelectedFiles(prev => prev.filter(file => file.id !== id));
  }, []);

  const getValidAttachmentsToSend = useCallback((): Attachment[] => {
    return selectedFiles.filter(f => 
      f.uploadState === 'completed_cloud_upload' && f.fileUri && !f.error
    );
  }, [selectedFiles]);
  
  const isAnyFileStillProcessing = useCallback((): boolean => {
    return selectedFiles.some(f => 
        (f.uploadState === 'uploading_to_cloud' || f.uploadState === 'processing_on_server' || f.uploadState === 'reading_client') && !f.error
    );
  }, [selectedFiles]);

  const resetSelectedFiles = useCallback(() => {
    setSelectedFiles([]);
  }, []);

  const getFileProgressDisplay = useCallback((file: Attachment): string => {
    const totalSizeMB = (file.size / 1024 / 1024).toFixed(1);
    switch(file.uploadState) {
        case 'reading_client':
            return `Reading for preview...`; 
        case 'uploading_to_cloud':
            const uploadProgress = file.progress || 0;
            const uploadedMB = (file.size * uploadProgress / 100 / 1024 / 1024).toFixed(1);
            return `${uploadedMB}MB / ${totalSizeMB}MB`; 
        case 'processing_on_server':
            return `Processing on server...`;
        case 'completed_cloud_upload':
            return `Cloud ready (${totalSizeMB}MB)`;
        case 'completed': 
            return file.fileUri ? `Cloud ready (${totalSizeMB}MB)` : `Preview ready`;
        case 'error_client_read':
            return `Preview Error: ${file.error || 'Failed'}`;
        case 'error_cloud_upload':
            return `Upload Error: ${file.error || 'Failed'}`;
        default:
            return file.statusMessage || `Waiting... (${totalSizeMB}MB)`;
    }
  }, []);
  
  const getDisplayFileType = useCallback((file: Attachment): string => {
    if (file.type === 'image') return "Image";
    if (file.type === 'video') return "Video";
    if (file.mimeType === 'application/pdf') return "PDF";
    if (file.mimeType.startsWith('text/')) return "Text";
    return "File";
  }, []);


  return {
    selectedFiles,
    handleFileSelection,
    handlePaste,
    removeSelectedFile,
    getValidAttachmentsToSend,
    isAnyFileStillProcessing,
    resetSelectedFiles,
    getFileProgressDisplay,
    getDisplayFileType,
  };
}
