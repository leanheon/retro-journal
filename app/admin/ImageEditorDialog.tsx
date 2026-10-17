"use client";

import Cropper, { type Area, type MediaSize, type Point } from "react-easy-crop";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  assertSafeImageSource,
  MAX_OUTPUT_DIMENSION,
  transformImage,
  type CropAreaPixels,
  type ImageAdjustments,
} from "./image-transform";
import "./image-editor.css";

type AspectChoice = "original" | "square" | "landscape" | "wide";
type CropSize = { width: number; height: number };

export type ImageEditorDialogProps = {
  source: string;
  filename?: string;
  description?: string;
  onDescriptionChange?: (value: string) => void;
  onApply: (file: File) => Promise<void>;
  onUseOriginal?: () => Promise<void>;
  onClose: () => void;
};

const ASPECTS: Array<{ value: AspectChoice; label: string; ratio?: number }> = [
  { value: "original", label: "원본" },
  { value: "square", label: "1 : 1", ratio: 1 },
  { value: "landscape", label: "4 : 3", ratio: 4 / 3 },
  { value: "wide", label: "16 : 9", ratio: 16 / 9 },
];

const INITIAL_ADJUSTMENTS: ImageAdjustments = {
  brightness: 100,
  contrast: 100,
  grayscale: 0,
};

function normaliseRotation(value: number): number {
  const rotation = value % 360;
  return rotation < 0 ? rotation + 360 : rotation;
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : "이미지를 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.";
}

function isGif(filename?: string, source?: string): boolean {
  return [filename, source].some(value => /\.gif(?:$|[?#])/i.test(value ?? ""));
}

export default function ImageEditorDialog({
  source,
  filename,
  description,
  onDescriptionChange,
  onApply,
  onUseOriginal,
  onClose,
}: ImageEditorDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const previousSourceRef = useRef(source);
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [flipX, setFlipX] = useState(false);
  const [flipY, setFlipY] = useState(false);
  const [aspectChoice, setAspectChoice] = useState<AspectChoice>("original");
  const [originalAspect, setOriginalAspect] = useState(1);
  const [mediaSize, setMediaSize] = useState<MediaSize | null>(null);
  const [cropSize, setCropSize] = useState<CropSize | null>(null);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [adjustments, setAdjustments] = useState<ImageAdjustments>(INITIAL_ADJUSTMENTS);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const sourceValidationError = useMemo(() => {
    try {
      assertSafeImageSource(source);
      return null;
    } catch (sourceError) {
      return errorMessage(sourceError);
    }
  }, [source]);
  const effectiveLoadError = sourceValidationError ?? loadError;
  const gifSource = isGif(filename, source);
  const rotationRadians = (rotation * Math.PI) / 180;
  const rotatedOriginalAspect = mediaSize
    ? (Math.abs(Math.cos(rotationRadians) * mediaSize.naturalWidth) + Math.abs(Math.sin(rotationRadians) * mediaSize.naturalHeight))
      / (Math.abs(Math.sin(rotationRadians) * mediaSize.naturalWidth) + Math.abs(Math.cos(rotationRadians) * mediaSize.naturalHeight))
    : originalAspect;
  const aspect = aspectChoice === "original"
    ? rotatedOriginalAspect
    : ASPECTS.find((choice) => choice.value === aspectChoice)?.ratio ?? originalAspect;
  const rotatedMediaWidth = mediaSize
    ? Math.abs(Math.cos(rotationRadians) * mediaSize.width) + Math.abs(Math.sin(rotationRadians) * mediaSize.height)
    : 0;
  const rotatedMediaHeight = mediaSize
    ? Math.abs(Math.sin(rotationRadians) * mediaSize.width) + Math.abs(Math.cos(rotationRadians) * mediaSize.height)
    : 0;
  const baseZoom = mediaSize && cropSize && rotatedMediaWidth > 0 && rotatedMediaHeight > 0
    ? Math.max(cropSize.width / rotatedMediaWidth, cropSize.height / rotatedMediaHeight)
    : 1;
  const effectiveZoom = baseZoom * zoom;
  const filter = useMemo(
    () => `brightness(${adjustments.brightness}%) contrast(${adjustments.contrast}%) grayscale(${adjustments.grayscale}%)`,
    [adjustments],
  );
  const transform = `translate(${crop.x}px, ${crop.y}px) rotate(${rotation}deg) scale(${flipX ? -effectiveZoom : effectiveZoom}, ${flipY ? -effectiveZoom : effectiveZoom})`;
  const outputSize = croppedAreaPixels
    ? `${Math.max(1, Math.round(croppedAreaPixels.width))} × ${Math.max(1, Math.round(croppedAreaPixels.height))}px`
    : mediaSize
      ? `${mediaSize.naturalWidth} × ${mediaSize.naturalHeight}px`
      : "원본 크기";

  useEffect(() => {
    if (previousSourceRef.current === source) return;
    previousSourceRef.current = source;
    const resetTimer = window.setTimeout(() => {
      setLoadError(null);
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setRotation(0);
      setFlipX(false);
      setFlipY(false);
      setAspectChoice("original");
      setOriginalAspect(1);
      setMediaSize(null);
      setCropSize(null);
      setCroppedAreaPixels(null);
      setAdjustments(INITIAL_ADJUSTMENTS);
      setError(null);
      setBusy(false);
    }, 0);
    return () => window.clearTimeout(resetTimer);
  }, [source]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    try {
      if (!dialog.open) dialog.showModal();
    } catch {
      // The parent may unmount the dialog during a fast source change.
    }
    return () => {
      if (dialog.open) dialog.close();
    };
  }, []);

  function requestClose() {
    if (busy) return;
    onClose();
  }

  function handleMediaLoaded(nextMediaSize: MediaSize) {
    setMediaSize(nextMediaSize);
    if (nextMediaSize.naturalWidth > 0 && nextMediaSize.naturalHeight > 0) {
      setOriginalAspect(nextMediaSize.naturalWidth / nextMediaSize.naturalHeight);
    }
    setLoadError(null);
  }

  function handleCropComplete(_area: Area, nextAreaPixels: Area) {
    setCroppedAreaPixels(nextAreaPixels);
  }

  function handleCropperZoomChange(nextZoom: number) {
    setZoom(Math.min(4, Math.max(1, nextZoom / baseZoom)));
  }

  function handleRotationChange(nextRotation: number) {
    const normalised = normaliseRotation(nextRotation);
    setRotation(normalised);
    if (aspectChoice === "original") {
      // The original ratio swaps at 90°/270° so the complete image remains visible.
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setCroppedAreaPixels(null);
    }
  }

  function resetEditor() {
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setRotation(0);
    setFlipX(false);
    setFlipY(false);
    setAspectChoice("original");
    setCropSize(null);
    setAdjustments(INITIAL_ADJUSTMENTS);
    setCroppedAreaPixels(null);
    setError(null);
  }

  async function handleApply() {
    if (busy || effectiveLoadError || !mediaSize || !croppedAreaPixels) return;
    setBusy(true);
    setError(null);
    try {
      const area: CropAreaPixels = croppedAreaPixels ?? {
        x: 0,
        y: 0,
        width: mediaSize?.naturalWidth ?? 1,
        height: mediaSize?.naturalHeight ?? 1,
      };
      const file = await transformImage({
        source,
        filename,
        crop: area,
        rotation,
        flipX,
        flipY,
        adjustments,
      });
      await onApply(file);
      onClose();
    } catch (applyError) {
      setError(errorMessage(applyError));
      setBusy(false);
    }
  }

  async function handleUseOriginal() {
    if (busy || !onUseOriginal || loadError) return;
    setBusy(true);
    setError(null);
    try {
      await onUseOriginal();
      onClose();
    } catch (originalError) {
      setError(errorMessage(originalError));
      setBusy(false);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className="image-editor-dialog"
      aria-labelledby="image-editor-title"
      onKeyDown={event => {
        if (event.key === "Enter" && event.target instanceof HTMLInputElement) event.preventDefault();
      }}
      onCancel={(event) => {
        event.preventDefault();
        requestClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) requestClose();
      }}
      onClose={requestClose}
    >
      <div className="image-editor-shell">
        <header className="image-editor-header">
          <div>
            <p className="image-editor-kicker">사진 편집 · 편집실</p>
            <h2 id="image-editor-title">이미지 다듬기</h2>
            <p className="image-editor-filename">{filename || "업로드한 이미지"}</p>
          </div>
          <button className="image-editor-close" type="button" onClick={requestClose} disabled={busy} aria-label="이미지 편집 닫기">×</button>
        </header>

        <div className="image-editor-body">
          <section className="image-editor-stage" aria-label="이미지 미리보기">
            {effectiveLoadError ? (
              <div className="image-editor-state image-editor-state-error" role="alert">{effectiveLoadError}</div>
            ) : (
              <div className="image-editor-cropper" style={{ "--image-filter": filter } as React.CSSProperties}>
                <Cropper
                  image={source}
                  crop={crop}
                  zoom={effectiveZoom}
                  rotation={rotation}
                  aspect={aspect}
                  minZoom={baseZoom}
                  maxZoom={baseZoom * 4}
                  objectFit="contain"
                  cropShape="rect"
                  showGrid
                  classes={{ mediaClassName: "image-editor-cropper-media" }}
                  mediaProps={{ alt: "편집 중인 이미지", onError: () => setLoadError("이미지를 불러오지 못했습니다. 파일을 다시 선택해 주세요.") }}
                  style={{ mediaStyle: { filter } }}
                  transform={transform}
                  onCropChange={setCrop}
                  onZoomChange={handleCropperZoomChange}
                  onCropSizeChange={setCropSize}
                  onCropComplete={handleCropComplete}
                  onMediaLoaded={handleMediaLoaded}
                />
              </div>
            )}
          </section>

          <section className="image-editor-controls" aria-label="이미지 편집 도구">
            <div className="image-editor-control-group">
              <span className="image-editor-label">자르기 비율</span>
              <div className="image-editor-preset-row" role="group" aria-label="자르기 비율 선택">
                {ASPECTS.map((choice) => (
                  <button
                    key={choice.value}
                    className={aspectChoice === choice.value ? "image-editor-preset active" : "image-editor-preset"}
                    type="button"
                    aria-pressed={aspectChoice === choice.value}
                    onClick={() => {
                      setAspectChoice(choice.value);
                      setCroppedAreaPixels(null);
                    }}
                    disabled={busy || Boolean(effectiveLoadError)}
                  >
                    {choice.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="image-editor-control-group image-editor-slider-group">
              <label htmlFor="image-editor-zoom">확대 <output>{zoom.toFixed(2)}×</output></label>
              <input id="image-editor-zoom" type="range" min="1" max="4" step="0.01" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} disabled={busy || Boolean(effectiveLoadError)} />
            </div>
            <div className="image-editor-control-group image-editor-slider-group">
              <label htmlFor="image-editor-rotation">회전 <output>{Math.round(rotation)}°</output></label>
              <input id="image-editor-rotation" type="range" min="0" max="359" step="1" value={rotation} onChange={(event) => handleRotationChange(Number(event.target.value))} disabled={busy || Boolean(effectiveLoadError)} />
            </div>

            <div className="image-editor-button-row" role="group" aria-label="이미지 변형">
              <button className="image-editor-tool-button" type="button" onClick={() => handleRotationChange(rotation + 90)} disabled={busy || Boolean(effectiveLoadError)}>↻ 90°</button>
              <button className={flipX ? "image-editor-tool-button active" : "image-editor-tool-button"} type="button" onClick={() => setFlipX((value) => !value)} aria-pressed={flipX} disabled={busy || Boolean(effectiveLoadError)}>↔ 좌우 반전</button>
              <button className={flipY ? "image-editor-tool-button active" : "image-editor-tool-button"} type="button" onClick={() => setFlipY((value) => !value)} aria-pressed={flipY} disabled={busy || Boolean(effectiveLoadError)}>↕ 상하 반전</button>
            </div>

            <div className="image-editor-adjustments">
              <div className="image-editor-adjustments-heading"><span className="image-editor-label">사진 보정</span><button className="image-editor-reset-link" type="button" onClick={resetEditor} disabled={busy}>초기화</button></div>
              <div className="image-editor-control-group image-editor-slider-group">
                <label htmlFor="image-editor-brightness">밝기 <output>{adjustments.brightness}</output></label>
                <input id="image-editor-brightness" type="range" min="50" max="150" step="1" value={adjustments.brightness} onChange={(event) => setAdjustments((value) => ({ ...value, brightness: Number(event.target.value) }))} disabled={busy || Boolean(effectiveLoadError)} />
              </div>
              <div className="image-editor-control-group image-editor-slider-group">
                <label htmlFor="image-editor-contrast">대비 <output>{adjustments.contrast}</output></label>
                <input id="image-editor-contrast" type="range" min="50" max="150" step="1" value={adjustments.contrast} onChange={(event) => setAdjustments((value) => ({ ...value, contrast: Number(event.target.value) }))} disabled={busy || Boolean(effectiveLoadError)} />
              </div>
              <div className="image-editor-control-group image-editor-slider-group">
                <label htmlFor="image-editor-grayscale">흑백 <output>{adjustments.grayscale}%</output></label>
                <input id="image-editor-grayscale" type="range" min="0" max="100" step="1" value={adjustments.grayscale} onChange={(event) => setAdjustments((value) => ({ ...value, grayscale: Number(event.target.value) }))} disabled={busy || Boolean(effectiveLoadError)} />
              </div>
            </div>

            {onDescriptionChange ? (
              <label className="image-editor-description-field" htmlFor="image-editor-description">
                <span>사진 설명 <small>읽기 보조용</small></span>
                <input id="image-editor-description" type="text" maxLength={180} value={description ?? ""} onChange={(event) => onDescriptionChange(event.target.value)} disabled={busy} placeholder="사진을 간단히 설명해 주세요" />
              </label>
            ) : null}

            <div className="image-editor-output-note">
              <span>출력 {outputSize} · 최대 {MAX_OUTPUT_DIMENSION}px</span>
              <span>{gifSource ? "GIF는 편집 시 첫 프레임으로 저장됩니다." : "PNG 투명도를 우선 보존합니다."}</span>
            </div>
            {error ? <p className="image-editor-error" role="alert">{error}</p> : null}
          </section>
        </div>

        <footer className="image-editor-footer">
          <button className="button button-secondary" type="button" onClick={requestClose} disabled={busy}>취소</button>
          <div className="image-editor-footer-actions">
            {onUseOriginal ? <button className="button button-secondary" type="button" onClick={() => void handleUseOriginal()} disabled={busy || Boolean(effectiveLoadError)}>{busy ? "처리 중…" : "원본 그대로 넣기"}</button> : null}
            <button className="button button-primary" type="button" onClick={() => void handleApply()} disabled={busy || Boolean(effectiveLoadError) || !mediaSize || !croppedAreaPixels}>{busy ? "저장하는 중…" : "편집한 이미지 넣기"}</button>
          </div>
        </footer>
      </div>
    </dialog>
  );
}
