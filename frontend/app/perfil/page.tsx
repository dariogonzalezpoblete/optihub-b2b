'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabaseClient';
import { formatRUT, isValidRUT } from '@/lib/utils/rut';
import { REGIONES_CHILE, getCommunesForRegion } from '@/lib/data/chileRegions';
import { Building2, User, Phone, MapPin, Save, AlertCircle, CheckCircle2 } from 'lucide-react';
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
        const { data, error } = await supabase.from('profiles').select('*').eq('id', user.id).single();
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
      // Upsert: Actualiza o inserta el perfil
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
      
      setMsg({ type: 'success', text: 'Perfil actualizado exitosamente. (Las órdenes históricas no cambiarán).' });
    } catch (error: any) {
      setMsg({ type: 'error', text: error.message || 'Error al guardar el perfil.' });
    } finally {
      setSaving(false);
    }
  };

  if (!mounted || authLoading) return null;

  return (
    <main className="min-h-screen pt-24 pb-20 bg-slate-950">
      <div className="max-w-4xl mx-auto px-4 sm:px-6">
        <div className="mb-8 border-b border-slate-800 pb-8">
          <h1 className="text-3xl font-black text-white flex items-center gap-3 tracking-tight">
            Mi Perfil B2B
          </h1>
          <p className="text-slate-400 mt-2">
            Gestiona tu identidad y datos de facturación para agilizar el checkout.
          </p>
        </div>

        {msg.text && (
          <div className={`mb-8 p-4 rounded-xl flex items-start gap-3 border ${
            msg.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
          }`}>
            {msg.type === 'success' ? <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" /> : <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />}
            <p className="font-semibold">{msg.text}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-8">
          
          {/* Datos Personales */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 md:p-8">
            <h2 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
              <User className="w-5 h-5 text-emerald-400" />
              Contacto Principal
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-400">Nombres</label>
                <input type="text" name="first_name" value={profile.first_name || ''} onChange={handleChange} className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-xl px-4 py-3 text-white outline-none transition" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-400">Apellidos</label>
                <input type="text" name="last_name" value={profile.last_name || ''} onChange={handleChange} className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-xl px-4 py-3 text-white outline-none transition" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-400 flex items-center gap-2"><Phone className="w-3 h-3"/> Teléfono</label>
                <input type="tel" name="phone" value={profile.phone || ''} onChange={handleChange} className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-xl px-4 py-3 text-white outline-none transition" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-400">Email (Sesión)</label>
                <input type="email" value={user?.email || ''} disabled className="w-full bg-slate-950 border border-slate-800/50 rounded-xl px-4 py-3 text-slate-500 outline-none cursor-not-allowed" />
              </div>
            </div>
          </div>

          {/* Datos Empresa */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 md:p-8">
            <h2 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
              <Building2 className="w-5 h-5 text-emerald-400" />
              Datos de Facturación B2B
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-400">RUT Empresa</label>
                <input type="text" name="rut" placeholder="Ej: 76.123.456-K" value={profile.rut || ''} onChange={handleChange} className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-xl px-4 py-3 text-white outline-none transition" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-400">Razón Social</label>
                <input type="text" name="business_name" value={profile.business_name || ''} onChange={handleChange} className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-xl px-4 py-3 text-white outline-none transition" />
              </div>
              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-bold text-slate-400">Giro Comercial</label>
                <input type="text" name="business_giro" value={profile.business_giro || ''} onChange={handleChange} className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-xl px-4 py-3 text-white outline-none transition" />
              </div>
            </div>
          </div>

          {/* Despacho predeterminado */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 md:p-8">
            <h2 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
              <MapPin className="w-5 h-5 text-emerald-400" />
              Dirección de Despacho
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-bold text-slate-400">Dirección Exacta</label>
                <input type="text" name="billing_address" value={profile.billing_address || ''} onChange={handleChange} className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-xl px-4 py-3 text-white outline-none transition" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-400">Región</label>
                <select
                  name="region"
                  value={profile.region || ''}
                  onChange={handleChange}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-xl px-4 py-3 text-white outline-none transition"
                >
                  <option value="">Seleccione una región...</option>
                  {REGIONES_CHILE.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-400">Comuna</label>
                <select
                  name="commune"
                  value={profile.commune || ''}
                  onChange={handleChange}
                  disabled={!profile.region}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 disabled:bg-slate-900 disabled:text-slate-600 disabled:cursor-not-allowed rounded-xl px-4 py-3 text-white outline-none transition"
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

          <div className="flex justify-end pt-4">
            <button
              type="submit"
              disabled={saving}
              className="bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-800 text-slate-950 font-black py-4 px-8 rounded-xl transition-all flex items-center gap-2"
            >
              {saving ? 'Guardando...' : <><Save className="w-5 h-5" /> Guardar Perfil B2B</>}
            </button>
          </div>

        </form>
      </div>
    </main>
  );
}
