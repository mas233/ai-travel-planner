import { create } from 'zustand'
import { supabase } from '../lib/supabase'

export const useAuthStore = create((set) => ({
  user: null,
  loading: true,

  checkUser: async () => {
    try {
      const { data: { session }, error } = await supabase.auth.getSession()
      set({ user: session?.user ?? null, loading: false })
    } catch (error) {
      console.error('❌ [认证检查失败] Error checking user:', error)
      set({ user: null, loading: false })
    }
  },

  signUp: async (email, password) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    })
    if (error) throw error
    set({ user: data.user })
    return data
  },

  signIn: async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    if (error) throw error
    set({ user: data.user })
    return data
  },

  signOut: async () => {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
    set({ user: null })
  },
}))
