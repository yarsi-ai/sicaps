'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import Capi from '@/components/Capi';
import AppFooter from '@/components/ui/AppFooter';
import Button from '@/components/ui/Button';
import Chip from '@/components/ui/Chip';
import HeaderBar from '@/components/ui/HeaderBar';
import LanguageSwitcher from '@/components/ui/LanguageSwitcher';
import { useScreening } from '../../_components/ScreeningProvider';
import { useFormValidation } from '../_hooks/useFormValidation';
import type { Gender } from '@/types/screening-ui';

export default function DemographicsScreen() {
  const t = useTranslations('demografis');
  const common = useTranslations('common');
  const router = useRouter();
  const { setDemographics } = useScreening();
  const { errors, validateUsia, showError, clearError } = useFormValidation();

  const [nama, setNama] = useState('');
  const [usia, setUsia] = useState('');
  const [jenisKelamin, setJenisKelamin] = useState<Gender>('');
  const [pendidikan, setPendidikan] = useState('');

  const pendOpts = t.raw('pendOpts') as string[];
  const isPrimary = pendidikan === pendOpts[0];
  const themeHint = isPrimary ? t('themeSD') : pendidikan ? t('themeHybrid') : t('themeNone');

  const submit = () => {
    if (!validateUsia(usia, t('errorUsia'))) return;
    if (!jenisKelamin) {
      showError('jenisKelamin', t('errorJenisKelamin'));
      return;
    }
    if (!pendidikan) {
      showError('pendidikan', t('errorPendidikan'));
      return;
    }
    setDemographics({
      nama: nama || undefined,
      usia: usia ? Number(usia) : undefined,
      jenisKelamin,
      pendidikan: pendidikan || undefined,
    });
    router.push('/chat');
  };

  return (
    <div className="flex h-full flex-col bg-surface-alt">
      <HeaderBar
        title={t('title')}
        onBack={() => router.push('/')}
        backLabel={common('back')}
        rightSlot={<LanguageSwitcher />}
      />

      <div className="flex-1 overflow-auto px-6.5 pt-1">
        <div className="mb-5 flex items-start gap-2.5">
          <Capi variant="logo" />
          <div className="rounded-bubble-bot border-2 border-border-subtle bg-surface-card px-3.5 py-2.5 shadow-sticker-sm">
            <p className="m-0 text-[13px] leading-relaxed text-text-body">{t('intro')}</p>
          </div>
        </div>

        <label className="mb-1.5 block text-[13px] font-extrabold text-text-strong">
          {t('nama')} <span className="font-semibold text-text-faint">{t('optional')}</span>
        </label>
        <input
          className="sc-input mb-4.5"
          value={nama}
          onChange={(e) => setNama(e.target.value)}
          placeholder={t('namaPh')}
        />

        <label className="mb-1.5 block text-[13px] font-extrabold text-text-strong">
          {t('usia')} <span className="text-accent-danger">*</span>
        </label>
        <input
          className="sc-input mb-1"
          value={usia}
          onChange={(e) => setUsia(e.target.value)}
          onBlur={() => validateUsia(usia, t('errorUsia'))}
          type="number"
          placeholder={t('usiaPh')}
        />
        {errors.usia && (
          <p className="mb-3.5 text-xs font-semibold text-accent-danger">{errors.usia}</p>
        )}
        {!errors.usia && <div className="mb-4.5" />}

        <label className="mb-1.5 block text-[13px] font-extrabold text-text-strong">
          {t('jenisKelamin')} <span className="text-accent-danger">*</span>
        </label>
        <div className="mb-1 flex gap-2.5">
          <Button
            variant={jenisKelamin === 'L' ? 'primary' : 'outlined'}
            size="md"
            className="flex-1 rounded-input"
            onClick={() => {
              setJenisKelamin('L');
              clearError('jenisKelamin');
            }}
          >
            {t('laki')}
          </Button>
          <Button
            variant={jenisKelamin === 'P' ? 'primary' : 'outlined'}
            size="md"
            className="flex-1 rounded-input"
            onClick={() => {
              setJenisKelamin('P');
              clearError('jenisKelamin');
            }}
          >
            {t('perempuan')}
          </Button>
        </div>
        {errors.jenisKelamin && (
          <p className="mb-3.5 text-xs font-semibold text-accent-danger">{errors.jenisKelamin}</p>
        )}
        {!errors.jenisKelamin && <div className="mb-4.5" />}

        <label className="mb-1.5 block text-[13px] font-extrabold text-text-strong">
          {t('pendidikan')} <span className="text-accent-danger">*</span>
        </label>
        <div className="mb-2 flex flex-wrap gap-2.5">
          {pendOpts.map((opt) => (
            <Chip
              key={opt}
              active={pendidikan === opt}
              onClick={() => {
                setPendidikan(opt);
                clearError('pendidikan');
              }}
            >
              {opt}
            </Chip>
          ))}
        </div>
        {errors.pendidikan && (
          <p className="mb-1 text-xs font-semibold text-accent-danger">{errors.pendidikan}</p>
        )}
        <p className="mb-4 text-[11.5px] leading-relaxed font-semibold text-text-muted">
          {themeHint}
        </p>
      </div>

      <AppFooter>
        <Button variant="primary" size="lg" fullWidth onClick={submit}>
          {t('cta')}
        </Button>
      </AppFooter>
    </div>
  );
}
