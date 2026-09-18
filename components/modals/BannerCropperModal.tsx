'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// CARIÑO — Banner Cropper / Resizer Modal
// Enforces strict 2.5:1 aspect ratio with interactive Zoom, Pan, and Crop.
// Output is rendered to an HTML5 canvas at exactly 1200 × 480 px.
// ─────────────────────────────────────────────────────────────────────────────

interface BannerCropperModalProps {
  isOpen: boolean;
  file: File | null;
  slotId: number | null;
  onClose: () => void;
  onConfirm: (processedFile: File) => void;
}

export function BannerCropperModal(props: BannerCropperModalProps) {
  if (!props.isOpen || !props.file) return null;
  return <BannerCropperContent key={`${props.file.name}-${props.file.lastModified}-${props.slotId}`} {...props} file={props.file} />;
}

function BannerCropperContent({
  file,
  slotId,
  onClose,
  onConfirm,
}: BannerCropperModalProps & { file: File }) {
  const [imageSrc, setImageSrc] = useState<string>('');
  const [imgNaturalSize, setImgNaturalSize] = useState<{ width: number; height: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [isProcessing, setIsProcessing] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  // Read file into Data URL inside useEffect keyed to [file]
  // Renders immediately, survives React StrictMode, and updates when a new file is chosen
  useEffect(() => {
    if (!file) return;
    let active = true;
    const reader = new FileReader();
    reader.onload = () => {
      if (active && typeof reader.result === 'string') {
        setImageSrc(reader.result);
      }
    };
    reader.readAsDataURL(file);

    return () => {
      active = false;
    };
  }, [file]);

  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    if (img.naturalWidth && img.naturalHeight) {
      setImgNaturalSize({ width: img.naturalWidth, height: img.naturalHeight });
    }
  };

  // Mouse drag handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDragging) return;
      setPan({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
    },
    [isDragging, dragStart]
  );

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Touch drag handlers for mobile/tablet
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      setIsDragging(true);
      setDragStart({ x: touch.clientX - pan.x, y: touch.clientY - pan.y });
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging || e.touches.length !== 1) return;
    const touch = e.touches[0];
    setPan({
      x: touch.clientX - dragStart.x,
      y: touch.clientY - dragStart.y,
    });
  };

  // Wheel zoom handler
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY * -0.0015;
    setZoom((prev) => Math.max(1, Math.min(3.5, prev + delta)));
  };

  // Render crop to 1200 x 480 canvas and export
  const handleCropAndConfirm = () => {
    if (!imgRef.current || !containerRef.current || !file) return;

    setIsProcessing(true);

    try {
      const img = imgRef.current;
      const container = containerRef.current;
      const containerRect = container.getBoundingClientRect();

      // Output canvas: strict 1200 x 480
      const canvas = document.createElement('canvas');
      canvas.width = 1200;
      canvas.height = 480;
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        throw new Error('Canvas context not available');
      }

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      // Calculate how the image is currently positioned & scaled relative to container
      const scaleX = 1200 / containerRect.width;
      const scaleY = 480 / containerRect.height;

      // Fill canvas background
      ctx.fillStyle = '#0E0E0E';
      ctx.fillRect(0, 0, 1200, 480);

      // Render image with pan and zoom applied
      ctx.save();
      ctx.translate(canvas.width / 2 + pan.x * scaleX, canvas.height / 2 + pan.y * scaleY);
      ctx.scale(zoom, zoom);

      // Compute display dimensions matching contain/cover baseline in container
      const naturalAspect = img.naturalWidth / img.naturalHeight;
      const containerAspect = 2.5; // 1200 / 480

      let renderWidth = 1200;
      let renderHeight = 480;

      if (naturalAspect > containerAspect) {
        renderHeight = 480;
        renderWidth = 480 * naturalAspect;
      } else {
        renderWidth = 1200;
        renderHeight = 1200 / naturalAspect;
      }

      ctx.drawImage(
        img,
        -renderWidth / 2,
        -renderHeight / 2,
        renderWidth,
        renderHeight
      );
      ctx.restore();

      canvas.toBlob(
        (blob) => {
          setIsProcessing(false);
          if (!blob) {
            alert('Failed to process cropped banner image.');
            return;
          }

          const cleanBase = file.name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_');
          const croppedFile = new File([blob], `${cleanBase}_1200x480.jpg`, {
            type: 'image/jpeg',
            lastModified: Date.now(),
          });

          onConfirm(croppedFile);
        },
        'image/jpeg',
        0.92
      );
    } catch (err) {
      setIsProcessing(false);
      alert(err instanceof Error ? err.message : 'Error cropping image');
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1200,
        background: 'rgba(0, 0, 0, 0.88)',
        backdropFilter: 'blur(12px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '720px',
          background: '#121214',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          borderRadius: '24px',
          padding: '28px',
          boxShadow: '0 32px 80px rgba(0, 0, 0, 0.8)',
          display: 'flex',
          flexDirection: 'column',
          gap: '20px',
        }}
        onClick={(e) => e.stopPropagation()}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: 800, color: '#FFFFFF', margin: 0, letterSpacing: '-0.02em' }}>
              Crop & Adjust Banner {slotId ? `(Slot ${slotId})` : ''}
            </h2>
            <p style={{ fontSize: '12px', color: '#8E8E93', margin: '4px 0 0' }}>
              Fixed aspect ratio <strong style={{ color: '#FFFFFF' }}>2.5 : 1</strong> • Output resolution <strong style={{ color: '#FFFFFF' }}>1200 × 480 px</strong>
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              width: '30px',
              height: '30px',
              borderRadius: '50%',
              background: 'rgba(255, 255, 255, 0.08)',
              border: 'none',
              color: '#8E8E93',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              fontSize: '14px',
            }}
          >
            ✕
          </button>
        </div>

        {/* 2.5:1 Cropper Viewport */}
        <div
          ref={containerRef}
          onMouseDown={handleMouseDown}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleMouseUp}
          onWheel={handleWheel}
          style={{
            position: 'relative',
            width: '100%',
            aspectRatio: '2.5 / 1',
            maxHeight: '260px',
            borderRadius: '16px',
            overflow: 'hidden',
            background: '#080808',
            border: '2px solid rgba(255, 255, 255, 0.3)',
            cursor: isDragging ? 'grabbing' : 'grab',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            userSelect: 'none',
            boxShadow: 'inset 0 0 24px rgba(0, 0, 0, 0.8)',
          }}
        >
          {imageSrc && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              ref={imgRef}
              src={imageSrc}
              alt="Crop preview"
              onLoad={handleImageLoad}
              draggable={false}
              style={{
                position: 'absolute',
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                transformOrigin: 'center center',
                maxWidth: 'none',
                width: imgNaturalSize && imgNaturalSize.width / imgNaturalSize.height > 2.5 ? 'auto' : '100%',
                height: imgNaturalSize && imgNaturalSize.width / imgNaturalSize.height > 2.5 ? '100%' : 'auto',
                pointerEvents: 'none',
                transition: isDragging ? 'none' : 'transform 0.08s ease-out',
              }}
            />
          )}

          {/* Rule of thirds grid overlay */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              pointerEvents: 'none',
              border: '1px dashed rgba(255, 255, 255, 0.2)',
              display: 'grid',
              gridTemplateColumns: '1fr 1fr 1fr',
              gridTemplateRows: '1fr 1fr 1fr',
            }}
          >
            <div style={{ borderRight: '1px dashed rgba(255,255,255,0.1)', borderBottom: '1px dashed rgba(255,255,255,0.1)' }} />
            <div style={{ borderRight: '1px dashed rgba(255,255,255,0.1)', borderBottom: '1px dashed rgba(255,255,255,0.1)' }} />
            <div style={{ borderBottom: '1px dashed rgba(255,255,255,0.1)' }} />
            <div style={{ borderRight: '1px dashed rgba(255,255,255,0.1)', borderBottom: '1px dashed rgba(255,255,255,0.1)' }} />
            <div style={{ borderRight: '1px dashed rgba(255,255,255,0.1)', borderBottom: '1px dashed rgba(255,255,255,0.1)' }} />
            <div style={{ borderBottom: '1px dashed rgba(255,255,255,0.1)' }} />
          </div>

          {/* Hint badge */}
          <div
            style={{
              position: 'absolute',
              bottom: '10px',
              left: '12px',
              background: 'rgba(0, 0, 0, 0.65)',
              backdropFilter: 'blur(6px)',
              padding: '4px 10px',
              borderRadius: '6px',
              fontSize: '11px',
              fontWeight: 500,
              color: 'rgba(255, 255, 255, 0.75)',
              pointerEvents: 'none',
            }}
          >
            Drag to pan • Scroll to zoom
          </div>
        </div>

        {/* Controls: Zoom & Reset */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '16px',
            background: '#161618',
            padding: '12px 18px',
            borderRadius: '14px',
            border: '1px solid rgba(255, 255, 255, 0.06)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: '#8E8E93' }}>Zoom</span>
            <button
              onClick={() => setZoom((z) => Math.max(1, z - 0.2))}
              style={{
                width: '26px',
                height: '26px',
                borderRadius: '6px',
                background: 'rgba(255, 255, 255, 0.1)',
                border: 'none',
                color: '#FFFFFF',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: 700,
              }}
            >
              −
            </button>
            <input
              type="range"
              min="1"
              max="3"
              step="0.05"
              value={zoom}
              onChange={(e) => setZoom(parseFloat(e.target.value))}
              style={{
                flex: 1,
                accentColor: '#FFFFFF',
                cursor: 'pointer',
              }}
            />
            <button
              onClick={() => setZoom((z) => Math.min(3, z + 0.2))}
              style={{
                width: '26px',
                height: '26px',
                borderRadius: '6px',
                background: 'rgba(255, 255, 255, 0.1)',
                border: 'none',
                color: '#FFFFFF',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: 700,
              }}
            >
              +
            </button>
            <span style={{ fontSize: '12px', fontWeight: 700, color: '#FFFFFF', minWidth: '42px', textAlign: 'right' }}>
              {Math.round(zoom * 100)}%
            </span>
          </div>

          <button
            onClick={() => {
              setZoom(1);
              setPan({ x: 0, y: 0 });
            }}
            style={{
              padding: '6px 14px',
              borderRadius: '8px',
              background: 'rgba(255, 255, 255, 0.08)',
              border: 'none',
              color: '#D1D1D6',
              fontSize: '11.5px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Reset
          </button>
        </div>

        {/* Footer Actions */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '12px' }}>
          <button
            onClick={onClose}
            disabled={isProcessing}
            style={{
              padding: '10px 20px',
              borderRadius: '9999px',
              background: 'transparent',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              color: '#FFFFFF',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleCropAndConfirm}
            disabled={isProcessing}
            style={{
              padding: '10px 24px',
              borderRadius: '9999px',
              background: '#FFFFFF',
              border: 'none',
              color: '#000000',
              fontSize: '13px',
              fontWeight: 700,
              cursor: isProcessing ? 'default' : 'pointer',
              boxShadow: '0 4px 16px rgba(255, 255, 255, 0.2)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            {isProcessing ? 'Processing 1200 × 480...' : 'Confirm & Apply'}
          </button>
        </div>
      </div>
    </div>
  );
}
