import React, { useState } from 'react';
import { User, LogIn, UserPlus, Ghost, Shield, AlertCircle, ChevronRight, Globe, Zap } from 'lucide-react';
import { defaultAuth, defaultDb, fastAuth, fastDb } from '../lib/firebase';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signInAnonymously, Auth } from 'firebase/auth';
import { doc, setDoc, getDoc, collection, query, where, getDocs, limit } from 'firebase/firestore';
import { ref, set, get, update, query as rtdbQuery, orderByChild, equalTo, limitToFirst } from 'firebase/database';
import { isMasterAdminUsername, verifyMasterAdminCredentials } from '../lib/security';

interface WelcomeScreenProps {
  onLoginComplete: (userData: any) => void;
  backendMode: 'default' | 'fast';
}

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({ onLoginComplete, backendMode }) => {
  const [view, setView] = useState<'WELCOME' | 'LOGIN' | 'REGISTER'>('WELCOME');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const currentAuth: Auth = backendMode === 'fast' ? fastAuth : defaultAuth;

  const generateGuestId = () => {
    return Math.floor(10000 + Math.random() * 90000).toString();
  };

  // === Fast mode (Realtime Database) helpers ===
  const rtdbCheckUsername = async (name: string): Promise<boolean> => {
    const q = rtdbQuery(ref(fastDb, 'users'), orderByChild('username_lowercase'), equalTo(name.toLowerCase()), limitToFirst(1));
    const snap = await get(q);
    return snap.exists();
  };

  const rtdbSaveUser = async (uid: string, data: any) => {
    await set(ref(fastDb, `users/${uid}`), data);
  };

  const rtdbGetUser = async (uid: string): Promise<any> => {
    const snap = await get(ref(fastDb, `users/${uid}`));
    return snap.exists() ? snap.val() : null;
  };

  const rtdbFindUserByUsername = async (name: string): Promise<any> => {
    const q = rtdbQuery(ref(fastDb, 'users'), orderByChild('username_lowercase'), equalTo(name.toLowerCase()), limitToFirst(1));
    const snap = await get(q);
    if (snap.exists()) {
      const val = snap.val();
      const key = Object.keys(val)[0];
      return { id: key, ...val[key] };
    }
    return null;
  };

  const rtdbUpdateUser = async (uid: string, data: any) => {
    await update(ref(fastDb, `users/${uid}`), data);
  };

  // === Default mode (Firestore) helpers ===
  const fsCheckUsername = async (name: string): Promise<boolean> => {
    const q = query(collection(defaultDb, 'users'), where('username_lowercase', '==', name.toLowerCase()), limit(1));
    const snap = await getDocs(q);
    return !snap.empty;
  };

  const fsSaveUser = async (uid: string, data: any) => {
    await setDoc(doc(defaultDb, 'users', uid), data);
  };

  const fsGetUser = async (uid: string): Promise<any> => {
    const snap = await getDoc(doc(defaultDb, 'users', uid));
    return snap.exists() ? snap.data() : null;
  };

  const fsFindUserByUsername = async (name: string): Promise<any> => {
    const q1 = query(collection(defaultDb, 'users'), where('username', '==', name), limit(1));
    let snap = await getDocs(q1);
    if (snap.empty) {
      const q2 = query(collection(defaultDb, 'users'), where('username_lowercase', '==', name.toLowerCase()), limit(1));
      snap = await getDocs(q2);
    }
    if (!snap.empty) {
      return { id: snap.docs[0].id, ...snap.docs[0].data() };
    }
    return null;
  };

  const fsUpdateUser = async (uid: string, data: any) => {
    await setDoc(doc(defaultDb, 'users', uid), data, { merge: true });
  };

  // === Unified helpers based on mode ===
  const checkUsername = backendMode === 'fast' ? rtdbCheckUsername : fsCheckUsername;
  const saveUser = backendMode === 'fast' ? rtdbSaveUser : fsSaveUser;
  const getUser = backendMode === 'fast' ? rtdbGetUser : fsGetUser;
  const findUserByUsername = backendMode === 'fast' ? rtdbFindUserByUsername : fsFindUserByUsername;
  const updateUser = backendMode === 'fast' ? rtdbUpdateUser : fsUpdateUser;

  const handleGuest = async () => {
    try {
      setLoading(true);
      setError('');
      
      let uid;
      try {
        const cred = await signInAnonymously(currentAuth);
        uid = cred.user.uid;
      } catch (fbError: any) {
        console.warn('Firebase anonymous auth failed, falling back to local guest:', fbError);
        uid = 'local_guest_' + Date.now();
      }

      const guestId = generateGuestId();
      const guestName = `Anon(${guestId})`;
      const guestData = {
        uid: uid,
        username: guestName,
        playerId: `#${guestId}`,
        isGuest: true,
        level: 1,
        xp: 0,
        matchesPlayed: 0
      };
      onLoginComplete(guestData);
    } catch (e: any) {
      setError(e.message || 'Failed to connect as guest');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (username.length < 3) {
      setError('Username must be at least 3 characters');
      return;
    }
    try {
      setLoading(true);
      setError('');

      const cleanName = username.trim();
      const isMasterUser = await isMasterAdminUsername(cleanName);
      const isMasterValid = await verifyMasterAdminCredentials(cleanName, password);

      if (isMasterUser && !isMasterValid) {
        setError('Invalid master admin password');
        setLoading(false);
        return;
      }

      const exists = await checkUsername(cleanName);
      if (exists) {
        setError(`Username '${cleanName}' is already taken. Please choose another username.`);
        setLoading(false);
        return;
      }

      const email = `${cleanName.toLowerCase()}@game.local`;
      const cred = await createUserWithEmailAndPassword(currentAuth, email, password);
      
      const playerId = isMasterUser ? '#00001' : `#${Math.floor(10000 + Math.random() * 90000)}`;
      
      const newUserData = {
        uid: cred.user.uid,
        username: cleanName,
        username_lowercase: cleanName.toLowerCase(),
        playerId,
        isGuest: false,
        isDeveloper: isMasterUser,
        isAdmin: isMasterUser,
        isSuperAdmin: isMasterUser,
        isPinAllowed: isMasterUser,
        isRootAdmin: isMasterUser,
        level: isMasterUser ? 100 : 1,
        xp: isMasterUser ? 99999 : 0,
        matchesPlayed: 0,
        wins: 0,
        losses: 0,
        kills: 0,
        deaths: 0,
        assists: 0,
        headshots: 0,
        highestKillStreak: 0,
        longestShot: 0,
        shotsFired: 0,
        shotsHit: 0,
        damageDealt: 0,
        damageTaken: 0,
        totalPlayTime: 0,
        createdAt: new Date().toISOString(),
        lastLogin: new Date().toISOString()
      };

      await saveUser(cred.user.uid, newUserData);
      onLoginComplete(newUserData);
    } catch (e: any) {
      if (e.code === 'auth/email-already-in-use') {
        setError('Username is already taken');
      } else if (e.code === 'auth/admin-restricted-operation' || e.code === 'auth/operation-not-allowed') {
        setError('Email/Password auth is disabled in your Firebase console. Please enable it in Authentication > Sign-in method.');
      } else {
        setError(e.message || 'Registration failed');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) {
      setError('Please enter username and password');
      return;
    }
    try {
      setLoading(true);
      setError('');
      const cleanName = username.trim();
      const isMasterUser = await isMasterAdminUsername(cleanName);
      const isMasterValid = await verifyMasterAdminCredentials(cleanName, password);

      if (isMasterUser && !isMasterValid) {
        setError('Invalid master admin password');
        setLoading(false);
        return;
      }

      const email = `${cleanName.toLowerCase()}@game.local`;
      let uid = '';
      try {
        const cred = await signInWithEmailAndPassword(currentAuth, email, password);
        uid = cred.user.uid;
      } catch (fbErr: any) {
        if (isMasterValid) {
          try {
            const regCred = await createUserWithEmailAndPassword(currentAuth, email, password);
            uid = regCred.user.uid;
            const adminData = {
              uid,
              username: cleanName,
              username_lowercase: cleanName.toLowerCase(),
              playerId: '#00001',
              isGuest: false,
              isDeveloper: true,
              isAdmin: true,
              isSuperAdmin: true,
              isPinAllowed: true,
              isRootAdmin: true,
              level: 100,
              xp: 99999,
              matchesPlayed: 100,
              wins: 100,
              losses: 0,
              kills: 999,
              deaths: 0,
              assists: 100,
              headshots: 50,
              highestKillStreak: 25,
              longestShot: 500,
              shotsFired: 1000,
              shotsHit: 900,
              damageDealt: 50000,
              damageTaken: 1000,
              totalPlayTime: 3600,
              createdAt: new Date().toISOString(),
              lastLogin: new Date().toISOString()
            };
            await saveUser(uid, adminData);
            onLoginComplete(adminData);
            setLoading(false);
            return;
          } catch (autoRegErr) {
            console.warn('Auto-register failed:', autoRegErr);
          }
        }

        // Fallback for forcePasswordReset or custom auth
        const found = await findUserByUsername(cleanName);
        if (found) {
          if (found.forcePasswordReset && found.forcePasswordReset === password) {
            uid = found.id || found.uid;
          } else {
            throw fbErr;
          }
        } else {
          throw fbErr;
        }
      }

      const data = await getUser(uid);
      if (data) {
        if (data.isBanned) {
          setError('This account has been permanently banned.');
          return;
        }
        if (data.banUntil && new Date(data.banUntil) > new Date()) {
          setError(`This account is temporarily banned until ${new Date(data.banUntil).toLocaleString()}`);
          return;
        }
        
        const extraAdminFlags = isMasterValid ? {
          isDeveloper: true,
          isAdmin: true,
          isSuperAdmin: true,
          isPinAllowed: true,
          isRootAdmin: true
        } : {};

        await updateUser(uid, { lastLogin: new Date().toISOString(), ...extraAdminFlags });
        onLoginComplete({ ...data, ...extraAdminFlags, lastLogin: new Date().toISOString(), uid });
      } else {
        setError('Account data not found');
      }
    } catch (e: any) {
      if (e.code === 'auth/admin-restricted-operation' || e.code === 'auth/operation-not-allowed') {
        setError('Email/Password auth is disabled in your Firebase console. Please enable it in Authentication > Sign-in method.');
      } else {
        setError('Invalid username or password');
      }
    } finally {
      setLoading(false);
    }
  };

  const ServerBadge = () => (
    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[11px] font-mono font-bold mb-8 mx-auto w-fit ${
      backendMode === 'fast'
        ? 'bg-cyan-500/10 border border-cyan-500/30 text-cyan-400'
        : 'bg-slate-800 border border-slate-700 text-slate-400'
    }`}>
      {backendMode === 'fast'
        ? <><Zap className="w-3.5 h-3.5" /> Scream of Justice Servers</>
        : <><Globe className="w-3.5 h-3.5" /> CallOfBooty Servers</>
      }
    </div>
  );

  if (view === 'WELCOME') {
    return (
      <div className="fixed inset-0 z-50 bg-slate-950 flex flex-col items-center justify-center bg-[url('https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=2070&auto=format&fit=crop')] bg-cover bg-center">
        <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" />
        
        <div className="relative z-10 max-w-md w-full px-6">
          <div className="text-center mb-6">
            <h1 className="text-5xl font-black text-white italic tracking-tighter drop-shadow-[0_0_15px_rgba(255,255,255,0.3)]">
              TACTICAL<span className="text-emerald-500">OPS</span>
            </h1>
            <p className="text-emerald-400 font-mono mt-2 text-sm tracking-widest">v1.2 // OPERATION: ONYX</p>
          </div>

          <ServerBadge />

          <div className="flex flex-col gap-4">
            <button 
              onClick={() => setView('REGISTER')}
              className="group relative flex items-center justify-between p-4 bg-slate-900 border-2 border-slate-700 hover:border-emerald-500 rounded-xl transition-all overflow-hidden"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/0 via-emerald-500/10 to-emerald-500/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
              <div className="flex items-center gap-4 relative z-10">
                <div className="w-12 h-12 bg-slate-800 rounded-lg flex items-center justify-center group-hover:bg-emerald-500/20 group-hover:text-emerald-400 transition-colors">
                  <UserPlus className="w-6 h-6" />
                </div>
                <div className="text-left">
                  <h3 className="text-white font-bold text-lg">Create Account</h3>
                  <p className="text-slate-400 text-sm">Save stats, unlock weapons & rank up</p>
                </div>
              </div>
              <ChevronRight className="w-6 h-6 text-slate-500 group-hover:text-emerald-400 transition-colors relative z-10" />
            </button>

            <button 
              onClick={() => setView('LOGIN')}
              className="group relative flex items-center justify-between p-4 bg-slate-900 border-2 border-slate-700 hover:border-blue-500 rounded-xl transition-all overflow-hidden"
            >
              <div className="flex items-center gap-4 relative z-10">
                <div className="w-12 h-12 bg-slate-800 rounded-lg flex items-center justify-center group-hover:bg-blue-500/20 group-hover:text-blue-400 transition-colors">
                  <LogIn className="w-6 h-6" />
                </div>
                <div className="text-left">
                  <h3 className="text-white font-bold text-lg">Login</h3>
                  <p className="text-slate-400 text-sm">Return to your existing account</p>
                </div>
              </div>
              <ChevronRight className="w-6 h-6 text-slate-500 group-hover:text-blue-400 transition-colors relative z-10" />
            </button>

            <div className="relative my-4">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-800"></div>
              </div>
              <div className="relative flex justify-center">
                <span className="bg-slate-950 px-4 text-xs font-mono text-slate-500">OR</span>
              </div>
            </div>

            <button 
              onClick={handleGuest}
              disabled={loading}
              className="group relative flex items-center justify-between p-4 bg-slate-900 border-2 border-slate-800 hover:border-slate-600 rounded-xl transition-all overflow-hidden"
            >
              <div className="flex items-center gap-4 relative z-10">
                <div className="w-12 h-12 bg-slate-950 rounded-lg flex items-center justify-center group-hover:text-white text-slate-500 transition-colors">
                  <Ghost className="w-6 h-6" />
                </div>
                <div className="text-left">
                  <h3 className="text-slate-300 font-bold text-lg">Play as Guest</h3>
                  <p className="text-slate-500 text-sm">Jump right in (no progression saved)</p>
                </div>
              </div>
              <ChevronRight className="w-6 h-6 text-slate-600 group-hover:text-slate-400 transition-colors relative z-10" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-950 flex flex-col items-center justify-center bg-[url('https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=2070&auto=format&fit=crop')] bg-cover bg-center">
      <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-md" />
      
      <div className="relative z-10 max-w-sm w-full px-6">
        <button 
          onClick={() => {
            setView('WELCOME');
            setError('');
            setUsername('');
            setPassword('');
            setConfirmPassword('');
          }}
          className="absolute -top-16 left-0 text-slate-400 hover:text-white flex items-center gap-2 transition-colors"
        >
          <ChevronRight className="w-5 h-5 rotate-180" />
          Back
        </button>

        <ServerBadge />

        <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 shadow-2xl">
          <div className="flex items-center gap-4 mb-6">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${view === 'REGISTER' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-blue-500/20 text-blue-400'}`}>
              {view === 'REGISTER' ? <UserPlus className="w-6 h-6" /> : <LogIn className="w-6 h-6" />}
            </div>
            <div>
              <h2 className="text-2xl font-bold text-white">{view === 'REGISTER' ? 'Create Account' : 'Welcome Back'}</h2>
              <p className="text-slate-400 text-sm">{view === 'REGISTER' ? 'Join the fight' : 'Login to deploy'}</p>
            </div>
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-3 flex items-start gap-3 mb-6">
              <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
              <p className="text-sm text-red-300">{error}</p>
            </div>
          )}

          <form onSubmit={view === 'REGISTER' ? handleRegister : handleLogin} className="flex flex-col gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Username</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                <input 
                  type="text" 
                  value={username}
                  onChange={e => setUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 16))}
                  className={`w-full bg-slate-950 border text-white rounded-xl py-3 pl-10 pr-4 outline-none transition-colors ${backendMode === 'fast' ? 'border-slate-700 focus:border-cyan-500' : 'border-slate-700 focus:border-emerald-500'}`}
                  placeholder="Player123"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Password</label>
              <div className="relative">
                <Shield className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                <input 
                  type="password" 
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className={`w-full bg-slate-950 border text-white rounded-xl py-3 pl-10 pr-4 outline-none transition-colors ${backendMode === 'fast' ? 'border-slate-700 focus:border-cyan-500' : 'border-slate-700 focus:border-emerald-500'}`}
                  placeholder="••••••••"
                  required
                />
              </div>
            </div>

            {view === 'REGISTER' && (
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Confirm Password</label>
                <div className="relative">
                  <Shield className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                  <input 
                    type="password" 
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    className={`w-full bg-slate-950 border text-white rounded-xl py-3 pl-10 pr-4 outline-none transition-colors ${backendMode === 'fast' ? 'border-slate-700 focus:border-cyan-500' : 'border-slate-700 focus:border-emerald-500'}`}
                    placeholder="••••••••"
                    required
                  />
                </div>
              </div>
            )}

            <button 
              type="submit"
              disabled={loading}
              className={`w-full py-3 rounded-xl font-bold text-white transition-all mt-4 flex items-center justify-center gap-2 ${
                loading ? 'opacity-50 cursor-not-allowed bg-slate-700' :
                view === 'REGISTER'
                  ? (backendMode === 'fast' ? 'bg-cyan-600 hover:bg-cyan-500' : 'bg-emerald-600 hover:bg-emerald-500')
                  : (backendMode === 'fast' ? 'bg-cyan-700 hover:bg-cyan-600' : 'bg-blue-600 hover:bg-blue-500')
              }`}
            >
              {loading ? 'Processing...' : view === 'REGISTER' ? 'CREATE ACCOUNT' : 'LOGIN'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
