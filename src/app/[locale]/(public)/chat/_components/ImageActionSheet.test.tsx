import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ImageActionSheet } from './ImageActionSheet';

// Mock next-intl
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const translations: Record<string, string> = {
      sheetTitle: 'Kirim Foto',
      takePhoto: 'Ambil Foto',
      chooseFromGallery: 'Pilih dari Galeri',
      cancel: 'Batal',
    };
    return translations[key] ?? key;
  },
}));

// Mock CONFIG with the visual detection settings
vi.mock('@/lib/config', () => ({
  CONFIG: {
    visualDetection: {
      MAX_FILE_SIZE_BYTES: 10 * 1024 * 1024, // 10MB
      ALLOWED_MIME_TYPES: [
        'image/jpeg',
        'image/png',
        'image/webp',
        'image/heic',
        'image/heif',
        'image/gif',
        'image/bmp',
        'image/tiff',
      ],
    },
  },
}));

// Mock validation functions
vi.mock('@/lib/vision/validation', () => ({
  isAllowedMimeType: (mimeType: string) =>
    [
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/heic',
      'image/heif',
      'image/gif',
      'image/bmp',
      'image/tiff',
    ].includes(mimeType),
  isWithinSizeLimit: (size: number) => size <= 10 * 1024 * 1024,
}));

describe('ImageActionSheet', () => {
  const defaultProps = {
    open: true,
    onClose: vi.fn(),
    onFileSelect: vi.fn(),
    onValidationError: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders all three options when open', () => {
    render(<ImageActionSheet {...defaultProps} />);

    expect(screen.getByText('Ambil Foto')).toBeInTheDocument();
    expect(screen.getByText('Pilih dari Galeri')).toBeInTheDocument();
    expect(screen.getByText('Batal')).toBeInTheDocument();
  });

  it('renders title when open', () => {
    render(<ImageActionSheet {...defaultProps} />);

    expect(screen.getByText('Kirim Foto')).toBeInTheDocument();
  });

  it('does not render when open is false', () => {
    render(<ImageActionSheet {...defaultProps} open={false} />);

    expect(screen.queryByText('Kirim Foto')).not.toBeInTheDocument();
  });

  it('triggers camera input with capture attribute when "Ambil Foto" clicked', () => {
    render(<ImageActionSheet {...defaultProps} />);

    // Find the hidden camera input - it should have capture="environment"
    const cameraInput = document.querySelector(
      'input[type="file"][capture="environment"]',
    ) as HTMLInputElement;
    expect(cameraInput).toBeInTheDocument();

    // Mock click event
    const clickSpy = vi.spyOn(cameraInput, 'click');

    fireEvent.click(screen.getByText('Ambil Foto'));

    expect(clickSpy).toHaveBeenCalled();
  });

  it('triggers gallery input (without capture) when "Pilih dari Galeri" clicked', () => {
    render(<ImageActionSheet {...defaultProps} />);

    // Find both file inputs - the gallery one should NOT have capture attribute
    const fileInputs = document.querySelectorAll('input[type="file"]');
    const galleryInput = Array.from(fileInputs).find(
      (input) => !input.hasAttribute('capture'),
    ) as HTMLInputElement;
    expect(galleryInput).toBeInTheDocument();

    const clickSpy = vi.spyOn(galleryInput, 'click');

    fireEvent.click(screen.getByText('Pilih dari Galeri'));

    expect(clickSpy).toHaveBeenCalled();
  });

  it('calls onClose when "Batal" clicked', () => {
    const onClose = vi.fn();
    render(<ImageActionSheet {...defaultProps} onClose={onClose} />);

    fireEvent.click(screen.getByText('Batal'));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onValidationError with "invalid_type" for invalid file types', () => {
    const onValidationError = vi.fn();
    render(<ImageActionSheet {...defaultProps} onValidationError={onValidationError} />);

    const cameraInput = document.querySelector('input[type="file"][capture]') as HTMLInputElement;

    // Create a mock invalid file (PDF)
    const invalidFile = new File(['test'], 'test.pdf', { type: 'application/pdf' });
    Object.defineProperty(cameraInput, 'files', {
      value: [invalidFile],
      writable: false,
    });

    fireEvent.change(cameraInput);

    expect(onValidationError).toHaveBeenCalledWith('invalid_type');
    expect(defaultProps.onFileSelect).not.toHaveBeenCalled();
  });

  it('calls onValidationError with "file_too_large" for oversized files', () => {
    const onValidationError = vi.fn();
    const onFileSelect = vi.fn();
    render(
      <ImageActionSheet
        {...defaultProps}
        onValidationError={onValidationError}
        onFileSelect={onFileSelect}
      />,
    );

    const cameraInput = document.querySelector('input[type="file"][capture]') as HTMLInputElement;

    // Create a mock file with valid type but too large (15MB > 10MB limit)
    const largeFile = new File(['x'.repeat(15 * 1024 * 1024)], 'large.jpg', {
      type: 'image/jpeg',
    });

    Object.defineProperty(cameraInput, 'files', {
      value: [largeFile],
      writable: false,
    });

    fireEvent.change(cameraInput);

    expect(onValidationError).toHaveBeenCalledWith('file_too_large');
    expect(onFileSelect).not.toHaveBeenCalled();
  });

  it('calls onFileSelect and onClose for valid files', () => {
    const onFileSelect = vi.fn();
    const onClose = vi.fn();
    render(<ImageActionSheet {...defaultProps} onFileSelect={onFileSelect} onClose={onClose} />);

    const cameraInput = document.querySelector('input[type="file"][capture]') as HTMLInputElement;

    // Create a valid file
    const validFile = new File(['test'], 'photo.jpg', { type: 'image/jpeg' });
    Object.defineProperty(validFile, 'size', { value: 1024 * 1024 }); // 1MB
    Object.defineProperty(cameraInput, 'files', {
      value: [validFile],
      writable: false,
    });

    fireEvent.change(cameraInput);

    expect(onClose).toHaveBeenCalled();
    expect(onFileSelect).toHaveBeenCalledWith(validFile);
  });

  it('does not call any handler when no file is selected', () => {
    const onFileSelect = vi.fn();
    const onValidationError = vi.fn();
    render(
      <ImageActionSheet
        {...defaultProps}
        onFileSelect={onFileSelect}
        onValidationError={onValidationError}
      />,
    );

    const cameraInput = document.querySelector('input[type="file"][capture]') as HTMLInputElement;

    // Simulate change event with no files
    Object.defineProperty(cameraInput, 'files', {
      value: [],
      writable: false,
    });

    fireEvent.change(cameraInput);

    expect(onFileSelect).not.toHaveBeenCalled();
    expect(onValidationError).not.toHaveBeenCalled();
  });

  it('accepts image/png files', () => {
    const onFileSelect = vi.fn();
    render(<ImageActionSheet {...defaultProps} onFileSelect={onFileSelect} />);

    const galleryInput = Array.from(document.querySelectorAll('input[type="file"]')).find(
      (input) => !input.hasAttribute('capture'),
    ) as HTMLInputElement;

    const pngFile = new File(['test'], 'photo.png', { type: 'image/png' });
    Object.defineProperty(pngFile, 'size', { value: 1024 * 1024 });
    Object.defineProperty(galleryInput, 'files', {
      value: [pngFile],
      writable: false,
    });

    fireEvent.change(galleryInput);

    expect(onFileSelect).toHaveBeenCalledWith(pngFile);
  });

  it('accepts image/webp files', () => {
    const onFileSelect = vi.fn();
    render(<ImageActionSheet {...defaultProps} onFileSelect={onFileSelect} />);

    const galleryInput = Array.from(document.querySelectorAll('input[type="file"]')).find(
      (input) => !input.hasAttribute('capture'),
    ) as HTMLInputElement;

    const webpFile = new File(['test'], 'photo.webp', { type: 'image/webp' });
    Object.defineProperty(webpFile, 'size', { value: 1024 * 1024 });
    Object.defineProperty(galleryInput, 'files', {
      value: [webpFile],
      writable: false,
    });

    fireEvent.change(galleryInput);

    expect(onFileSelect).toHaveBeenCalledWith(webpFile);
  });

  it('has hidden file inputs with correct accept attribute', () => {
    render(<ImageActionSheet {...defaultProps} />);

    const fileInputs = document.querySelectorAll('input[type="file"]');
    expect(fileInputs.length).toBe(2);

    fileInputs.forEach((input) => {
      const expectedAccept =
        'image/jpeg,image/png,image/webp,image/heic,image/heif,image/gif,image/bmp,image/tiff';
      expect(input).toHaveAttribute('accept', expectedAccept);
    });
  });

  it('has X close button in the action sheet', () => {
    const onClose = vi.fn();
    render(<ImageActionSheet {...defaultProps} onClose={onClose} />);

    // There are two Batal buttons - one is the text button, one is the X icon with aria-label
    const buttons = screen.getAllByRole('button', { name: 'Batal' });
    expect(buttons.length).toBe(2);

    // The X button should be the one with aria-label (positioned absolute top-right)
    const xButton = buttons.find((btn) => btn.classList.contains('absolute'));
    expect(xButton).toBeInTheDocument();
  });
});
