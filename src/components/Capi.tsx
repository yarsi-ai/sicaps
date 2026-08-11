type CapiVariant =
  | 'logo' // 34x34 header wordmark icon
  | 'avatar-demografis' // 34x32 intro-card mini face
  | 'avatar-chat' // 40x40 chat header avatar
  | 'hero' // 142x132 landing hero illustration
  | 'medallion' // 72x68 translucent hasil header medallion
  | 'empty'; // 96x90 history empty-state illustration

interface CapiProps {
  variant: CapiVariant;
}

/** The Capi mascot, built entirely from CSS shapes (no image assets). */
export default function Capi({ variant }: CapiProps) {
  if (variant === 'logo') {
    return (
      <div
        style={{
          width: 38,
          height: 38,
          borderRadius: 12,
          background: 'var(--color-brand-secondary)',
          border: '2px solid var(--color-text-strong)',
          boxShadow: '0 2px 0 var(--color-text-strong)',
          position: 'relative',
          flex: 'none',
        }}
      >
        <Eye
          size={9}
          eyeH={10}
          pupil={5}
          top={11}
          side="left"
          offset={7}
          pupilTop={3}
          pupilLeft={2}
        />
        <Eye
          size={9}
          eyeH={10}
          pupil={5}
          top={11}
          side="right"
          offset={7}
          pupilTop={3}
          pupilLeft={2}
        />
        <Mouth width={11} height={5} border={2} bottom={7} left={11.5} />
      </div>
    );
  }

  if (variant === 'avatar-demografis') {
    return (
      <div
        style={{
          width: 34,
          height: 32,
          flex: 'none',
          background:
            'radial-gradient(circle at 38% 30%, var(--color-brand-secondary-light), var(--color-brand-secondary))',
          border: '2px solid var(--color-text-strong)',
          borderRadius: '50% 50% 47% 47%',
          position: 'relative',
        }}
      >
        <Eye
          size={7}
          eyeH={8}
          pupil={4}
          top={10}
          side="left"
          offset={7}
          pupilTop={3}
          pupilLeft={1.5}
        />
        <Eye
          size={7}
          eyeH={8}
          pupil={4}
          top={10}
          side="right"
          offset={7}
          pupilTop={3}
          pupilLeft={1.5}
        />
        <Mouth width={9} height={5} border={2} bottom={6} left={11} />
      </div>
    );
  }

  if (variant === 'avatar-chat') {
    return (
      <div
        style={{
          width: 38,
          height: 38,
          borderRadius: 12,
          background:
            'radial-gradient(circle at 38% 30%, var(--color-brand-secondary-light), var(--color-brand-secondary))',
          border: '2px solid var(--color-text-strong)',
          position: 'relative',
          flex: 'none',
        }}
      >
        <Eye
          size={9}
          eyeH={11}
          pupil={5}
          top={12}
          side="left"
          offset={8}
          pupilTop={4}
          pupilLeft={2}
        />
        <Eye
          size={9}
          eyeH={11}
          pupil={5}
          top={12}
          side="right"
          offset={8}
          pupilTop={4}
          pupilLeft={2}
        />
        <Mouth width={11} height={6} border={2.5} bottom={8} left={12.5} />
      </div>
    );
  }

  if (variant === 'medallion') {
    return (
      <div
        style={{
          width: 72,
          height: 68,
          margin: '2px auto 6px',
          background: 'rgba(255,249,236,.14)',
          border: '2px solid var(--color-text-strong)',
          borderRadius: '50% 50% 47% 47%',
          position: 'relative',
        }}
      >
        <div
          style={{
            position: 'absolute',
            width: 15,
            height: 18,
            background: '#FFF9EC',
            borderRadius: '50%',
            top: 21,
            left: 16,
          }}
        >
          <div
            style={{
              position: 'absolute',
              width: 8,
              height: 8,
              background: 'var(--color-text-strong)',
              borderRadius: '50%',
              top: 6,
              left: 4,
            }}
          />
        </div>
        <div
          style={{
            position: 'absolute',
            width: 15,
            height: 18,
            background: '#FFF9EC',
            borderRadius: '50%',
            top: 21,
            right: 16,
          }}
        >
          <div
            style={{
              position: 'absolute',
              width: 8,
              height: 8,
              background: 'var(--color-text-strong)',
              borderRadius: '50%',
              top: 6,
              left: 4,
            }}
          />
        </div>
        <div
          style={{
            position: 'absolute',
            width: 18,
            height: 9,
            borderBottom: '3px solid var(--color-text-strong)',
            borderRadius: '0 0 18px 18px',
            bottom: 16,
            left: 26,
          }}
        />
      </div>
    );
  }

  if (variant === 'empty') {
    return (
      <div
        style={{
          width: 96,
          height: 90,
          background:
            'radial-gradient(circle at 38% 30%, var(--color-brand-secondary-light), var(--color-brand-secondary))',
          border: '3px solid var(--color-text-strong)',
          borderRadius: '50% 50% 47% 47%',
          position: 'relative',
          boxShadow: '0 5px 0 var(--color-shadow-mascot, rgba(58,45,31,.25))',
        }}
      >
        <Antenna side="left" top={-9} offset={32} length={13} />
        <Antenna side="right" top={-9} offset={32} length={13} />
        <AntennaTip side="left" top={-14} offset={29} size={9} />
        <AntennaTip side="right" top={-14} offset={29} size={9} />
        <Eye
          size={20}
          eyeH={23}
          pupil={9}
          top={27}
          side="left"
          offset={21}
          pupilTop={8}
          pupilLeft={5}
        />
        <Eye
          size={20}
          eyeH={23}
          pupil={9}
          top={27}
          side="right"
          offset={21}
          pupilTop={8}
          pupilLeft={4}
        />
        <Mouth width={22} height={11} border={3} bottom={16} left={35} radius={20} />
      </div>
    );
  }

  // hero — 142x132 landing illustration (full anatomy: antennae + eyes + mouth + cheeks)
  return (
    <div
      style={{
        width: 142,
        height: 132,
        background:
          'radial-gradient(circle at 38% 30%, var(--color-brand-secondary-light), var(--color-brand-secondary))',
        border: '3px solid var(--color-text-strong)',
        borderRadius: '50% 50% 47% 47%',
        position: 'relative',
        boxShadow: '0 6px 0 var(--color-shadow-mascot, rgba(58,45,31,.28))',
      }}
    >
      <Antenna side="left" top={-14} offset={47} length={19} width={6} />
      <Antenna side="right" top={-14} offset={47} length={19} width={6} />
      <AntennaTip side="left" top={-21} offset={43} size={12} />
      <AntennaTip side="right" top={-21} offset={43} size={12} />
      <div
        style={{
          position: 'absolute',
          width: 29,
          height: 33,
          background: '#FFFBF0',
          border: '2px solid var(--color-text-strong)',
          borderRadius: '50%',
          top: 40,
          left: 32,
        }}
      >
        <div
          style={{
            position: 'absolute',
            width: 13,
            height: 13,
            background: 'var(--color-text-strong)',
            borderRadius: '50%',
            top: 12,
            left: 8,
          }}
        />
      </div>
      <div
        style={{
          position: 'absolute',
          width: 29,
          height: 33,
          background: '#FFFBF0',
          border: '2px solid var(--color-text-strong)',
          borderRadius: '50%',
          top: 40,
          right: 32,
        }}
      >
        <div
          style={{
            position: 'absolute',
            width: 13,
            height: 13,
            background: 'var(--color-text-strong)',
            borderRadius: '50%',
            top: 12,
            left: 6,
          }}
        />
      </div>
      <Mouth width={30} height={15} border={4} bottom={26} left={53} />
      <div
        style={{
          position: 'absolute',
          width: 15,
          height: 15,
          background: 'var(--color-accent-blush)',
          borderRadius: '50%',
          bottom: 33,
          left: 24,
          opacity: 0.85,
        }}
      />
      <div
        style={{
          position: 'absolute',
          width: 15,
          height: 15,
          background: 'var(--color-accent-blush)',
          borderRadius: '50%',
          bottom: 33,
          right: 24,
          opacity: 0.85,
        }}
      />
    </div>
  );
}

function Eye({
  size,
  eyeH,
  pupil,
  top,
  side,
  offset,
  pupilTop,
  pupilLeft,
}: {
  size: number;
  eyeH: number;
  pupil: number;
  top: number;
  side: 'left' | 'right';
  offset: number;
  pupilTop: number;
  pupilLeft: number;
}) {
  return (
    <div
      style={{
        position: 'absolute',
        width: size,
        height: eyeH,
        background: '#FFFBF0',
        borderRadius: '50%',
        top,
        ...(side === 'left' ? { left: offset } : { right: offset }),
      }}
    >
      <div
        style={{
          position: 'absolute',
          width: pupil,
          height: pupil,
          background: 'var(--color-text-strong)',
          borderRadius: '50%',
          top: pupilTop,
          left: pupilLeft,
        }}
      />
    </div>
  );
}

function Mouth({
  width,
  height,
  border,
  bottom,
  left,
  radius = width,
}: {
  width: number;
  height: number;
  border: number;
  bottom: number;
  left: number;
  radius?: number;
}) {
  return (
    <div
      style={{
        position: 'absolute',
        width,
        height,
        borderBottom: `${border}px solid var(--color-text-strong)`,
        borderRadius: `0 0 ${radius}px ${radius}px`,
        bottom,
        left,
      }}
    />
  );
}

function Antenna({
  side,
  top,
  offset,
  length,
  width = 5,
}: {
  side: 'left' | 'right';
  top: number;
  offset: number;
  length: number;
  width?: number;
}) {
  return (
    <div
      style={{
        position: 'absolute',
        width,
        height: length,
        background: 'var(--color-text-strong)',
        borderRadius: 3,
        top,
        ...(side === 'left' ? { left: offset } : { right: offset }),
        transform: `rotate(${side === 'left' ? '-' : ''}18deg)`,
      }}
    />
  );
}

function AntennaTip({
  side,
  top,
  offset,
  size,
}: {
  side: 'left' | 'right';
  top: number;
  offset: number;
  size: number;
}) {
  return (
    <div
      style={{
        position: 'absolute',
        width: size,
        height: size,
        background: 'var(--color-accent-amber)',
        border: '2px solid var(--color-text-strong)',
        borderRadius: '50%',
        top,
        ...(side === 'left' ? { left: offset } : { right: offset }),
      }}
    />
  );
}
