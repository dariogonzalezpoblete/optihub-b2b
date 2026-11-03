'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabaseClient';
import { formatRUT, isValidRUT } from '@/lib/utils/rut';
import { REGIONES_CHILE, getCommunesForRegion } from '@/lib/data/chileRegions';
import { Building2, User, Phone, MapPin, Save, AlertCircle, CheckCircle2, ArrowLeft } from 'lucide-react';
import type { Profile } from '@/lib/catalog/types';

export default function PerfilPage() {
  const router = useRouter();
  const { user, isLoggedIn, loading: authLoading } = useAuth();
  
  const [mounted, setMounted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState({ type: '', text: '' });
  
  const [profile, setProfile] = useState<Partial<Profile>>({
    first_name: '',
    last_name: '',
    phone: '',
    rut: '',
    business_name: '',
    business_giro: '',
    billing_address: '',
    commune: '',
    region: 'Región Metropolitana de Santiago',
  });

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const loadProfile = async () => {
      if (!user) return;
      try {
        const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single();
        if (data) {
          setProfile(data);
        }
      } catch (err) {
        console.error(err);
      }
    };

    if (mounted && !authLoading) {
      if (!isLoggedIn) {
        router.push('/login?redirect=/perfil');
        return;
      }
      loadProfile();
    }
  }, [mounted, authLoading, isLoggedIn, router, user]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    let value = e.target.value;
    if (e.target.name === 'rut') {
      value = formatRUT(value);
    }
    if (e.target.name === 'region') {
      const newRegion = value;
      const validCommunes = getCommunesForRegion(newRegion);
      setProfile((prev) => ({
        ...prev,
        region: newRegion,
        commune: validCommunes.includes(prev.commune || '') ? prev.commune : '',
      }));
      return;
    }
    setProfile(prev => ({ ...prev, [e.target.name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg({ type: '', text: '' });

    if (profile.rut && !isValidRUT(profile.rut)) {
      setMsg({ type: 'error', text: 'El RUT ingresado no es válido.' });
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.from('profiles').upsert({
        id: user!.id,
        first_name: profile.first_name,
        last_name: profile.last_name,
        phone: profile.phone,
        rut: profile.rut,
        business_name: profile.business_name,
        business_giro: profile.business_giro,
        billing_address: profile.billing_address,
        commune: profile.commune,
        region: profile.region,
        updated_at: new Date().toISOString()
      });

      if (error) throw error;
      
      setMsg({ type: 'success', text: 'Perfil comercial actualizado exitosamente. (Las órdenes históricas no cambiarán).' });
    } catch (error: any) {
      setMsg({ type: 'error', text: error.message || 'Error al guardar el perfil.' });
    } finally {
      setSaving(false);
    }
  };

  if (!mounted || authLoading) return null;

  return (
    <main className="min-h-screen bg-[#FAF9F6] text-[#0F0F0F] pb-24">
      <div className="border-b border-[#E6E2DD] bg-[#FFFFFF] py-10 px-4 sm:px-6 lg:px-8 mb-8">
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#9E8256] block mb-1 font-mono">
              CUENTA CORPORATIVA ÓPTICA
            </span>
            <h1 className="font-serif text-3xl sm:text-4xl font-normal text-[#0F0F0F] tracking-tight">
              Mi Perfil B2B y Facturación SII
            </h1>
            <p className="text-[#5C5A55] text-xs sm:text-sm mt-2">
              Gestione los datos tributarios y dirección de recepción de su óptica para agilizar sus pedidos mayoristas.
            </p>
          </div>
          <Link
            href="/mis-pedidos"
            className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] font-medium text-[#0F0F0F] hover:text-[#9E8256] border border-[#E6E2DD] bg-[#FAF9F6] px-4 py-2.5 transition self-start sm:self-auto"
          >
            <ArrowLeft className="w-3.5 h-3.5 text-[#9E8256]" />
            <span>Mis Pedidos</span>
          </Link>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6">
        {msg.text && (
          <div className={`mb-8 p-4 flex items-start gap-3 border text-xs ${
            msg.type === 'success'
              ? 'bg-[#F4F8F5] border-[#C4D9C8] text-[#2D6A4F]'
              : 'bg-[#FAF4F4] border-[#E6D0D0] text-[#9E3838]'
          }`}>
            {msg.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-[#2D6A4F]" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-[#9E3838]" />
            )}
            <p className="font-medium">{msg.text}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-8">
          
          {/* Datos Personales */}
          <div className="bg-[#FFFFFF] border border-[#E6E2DD] p-6 md:p-8">
            <h2 className="font-serif text-xl font-normal text-[#0F0F0F] mb-6 pb-3 border-b border-[#E6E2DD] flex items-center gap-2.5">
              <User className="w-4 h-4 text-[#9E8256]" />
              Contacto Principal en Óptica
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold uppercase tracking-wider text-[#5C5A55] block">Nombres</label>
                <input
                  type="text"
                  name="first_name"
                  value={profile.first_name || ''}
                  onChange={handleChange}
                  className="w-full bg-[#FAF9F6] border border-[#E6E2DD] focus:bg-[#FFFFFF] focus:border-[#0F0F0F] px-4 py-3 text-sm text-[#0F0F0F] outline-none transition"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold uppercase tracking-wider text-[#5C5A55] block">Apellidos</label>
                <input
                  type="text"
                  name="last_name"
                  value={profile.last_name || ''}
                  onChange={handleChange}
                  className="w-full bg-[#FAF9F6] border border-[#E6E2DD] focus:bg-[#FFFFFF] focus:border-[#0F0F0F] px-4 py-3 text-sm text-[#0F0F0F] outline-none transition"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold uppercase tracking-wider text-[#5C5A55] flex items-center gap-1.5">
                  <Phone className="w-3 h-3 text-[#9E8256]" /> Teléfono Directo / WhatsApp
                </label>
                <input
                  type="tel"
                  name="phone"
                  value={profile.phone || ''}
                  onChange={handleChange}
                  className="w-full bg-[#FAF9F6] border border-[#E6E2DD] focus:bg-[#FFFFFF] focus:border-[#0F0F0F] px-4 py-3 text-sm font-mono text-[#0F0F0F] outline-none transition"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold uppercase tracking-wider text-[#5C5A55] block">Correo Corporativo (Sesión)</label>
                <input
                  type="email"
                  value={user?.email || ''}
                  disabled
                  className="w-full bg-[#F4F2ED] border border-[#E6E2DD] px-4 py-3 text-sm text-[#787670] outline-none cursor-not-allowed"
                />
              </div>
            </div>
          </div>

          {/* Datos Empresa */}
          <div className="bg-[#FFFFFF] border border-[#E6E2DD] p-6 md:p-8">
            <h2 className="font-serif text-xl font-normal text-[#0F0F0F] mb-6 pb-3 border-b border-[#E6E2DD] flex items-center gap-2.5">
              <Building2 className="w-4 h-4 text-[#9E8256]" />
              Datos Tributarios de Facturación Electrónica SII
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold uppercase tracking-wider text-[#5C5A55] block">RUT Empresa / Óptica</label>
                <input
                  type="text"
                  name="rut"
                  placeholder="Ej: 76.123.456-K"
                  value={profile.rut || ''}
                  onChange={handleChange}
                  className="w-full bg-[#FAF9F6] border border-[#E6E2DD] focus:bg-[#FFFFFF] focus:border-[#0F0F0F] px-4 py-3 text-sm font-mono text-[#0F0F0F] outline-none transition"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold uppercase tracking-wider text-[#5C5A55] block">Razón Social</label>
                <input
                  type="text"
                  name="business_name"
                  value={profile.business_name || ''}
                  onChange={handleChange}
                  className="w-full bg-[#FAF9F6] border border-[#E6E2DD] focus:bg-[#FFFFFF] focus:border-[#0F0F0F] px-4 py-3 text-sm text-[#0F0F0F] outline-none transition"
                />
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <label className="text-[11px] font-semibold uppercase tracking-wider text-[#5C5A55] block">Giro Comercial SII</label>
                <input
                  type="text"
                  name="business_giro"
                  value={profile.business_giro || ''}
                  onChange={handleChange}
                  className="w-full bg-[#FAF9F6] border border-[#E6E2DD] focus:bg-[#FFFFFF] focus:border-[#0F0F0F] px-4 py-3 text-sm text-[#0F0F0F] outline-none transition"
                />
              </div>
            </div>
          </div>

          {/* Despacho predeterminado */}
          <div className="bg-[#FFFFFF] border border-[#E6E2DD] p-6 md:p-8">
            <h2 className="font-serif text-xl font-normal text-[#0F0F0F] mb-6 pb-3 border-b border-[#E6E2DD] flex items-center gap-2.5">
              <MapPin className="w-4 h-4 text-[#9E8256]" />
              Dirección de Recepción en Sucursal o Bodega
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-1.5 md:col-span-2">
                <label className="text-[11px] font-semibold uppercase tracking-wider text-[#5C5A55] block">Dirección Exacta</label>
                <input
                  type="text"
                  name="billing_address"
                  value={profile.billing_address || ''}
                  onChange={handleChange}
                  className="w-full bg-[#FAF9F6] border border-[#E6E2DD] focus:bg-[#FFFFFF] focus:border-[#0F0F0F] px-4 py-3 text-sm text-[#0F0F0F] outline-none transition"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold uppercase tracking-wider text-[#5C5A55] block">Región</label>
                <select
                  name="region"
                  value={profile.region || ''}
                  onChange={handleChange}
                  className="w-full bg-[#FAF9F6] border border-[#E6E2DD] focus:bg-[#FFFFFF] focus:border-[#0F0F0F] px-4 py-3 text-sm text-[#0F0F0F] outline-none transition"
                >
                  <option value="">Seleccione una región...</option>
                  {REGIONES_CHILE.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold uppercase tracking-wider text-[#5C5A55] block">Comuna</label>
                <select
                  name="commune"
                  value={profile.commune || ''}
                  onChange={handleChange}
                  disabled={!profile.region}
                  className="w-full bg-[#FAF9F6] border border-[#E6E2DD] focus:bg-[#FFFFFF] focus:border-[#0F0F0F] disabled:bg-[#F4F2ED] disabled:text-[#787670] disabled:cursor-not-allowed px-4 py-3 text-sm text-[#0F0F0F] outline-none transition"
                >
                  <option value="">
                    {profile.region ? 'Seleccione una comuna...' : 'Primero seleccione región'}
                  </option>
                  {getCommunesForRegion(profile.region).map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={saving}
              className="bg-[#0F0F0F] hover:bg-[#262626] disabled:bg-[#E6E2DD] disabled:text-[#787670] text-white text-[11px] uppercase tracking-[0.2em] font-medium py-4 px-8 transition flex items-center gap-2 border border-[#0F0F0F] cursor-pointer"
            >
              {saving ? 'Guardando...' : <><Save className="w-4 h-4 text-[#9E8256]" /> Guardar Perfil B2B</>}
            </button>
          </div>

        </form>
      </div>
    </main>
  );
}
