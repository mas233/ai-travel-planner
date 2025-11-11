import { create } from 'zustand'
import { supabase } from '../lib/supabase'

export const useAuthStore = create((set) => ({
  user: null,
  loading: true,

  checkUser: async () => {
    try {
      console.log('🔐 [认证检查] 开始检查用户会话')
      const { data: { session }, error } = await supabase.auth.getSession()
      
      // 🔴 断点位置 6: 在这里打断点可以查看用户会话数据
      console.log('📦 [认证原始响应] 会话数据完整响应:', { session, error })
      if (session?.user) {
        console.log('👤 [认证原始数据] 用户对象完整结构:')
        console.log(JSON.stringify(session.user, null, 2))
        console.log('🔑 [认证原始数据] 用户对象所有字段:', Object.keys(session.user))
      }
      
      set({ user: session?.user ?? null, loading: false })
      console.log('✅ [认证检查完成] 用户:', session?.user?.email || '未登录')
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