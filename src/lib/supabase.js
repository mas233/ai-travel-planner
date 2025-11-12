import { createClient } from '@supabase/supabase-js'
import { getEnv } from '../utils/env'

const supabaseUrl = getEnv('VITE_SUPABASE_URL')
const supabaseAnonKey = getEnv('VITE_SUPABASE_ANON_KEY')

function dispatchMissing() {
  try { window.dispatchEvent(new CustomEvent('env:config-required', { detail: { missing: ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'] } })) } catch {}
}

let supabase
if (!supabaseUrl || !supabaseAnonKey) {
  dispatchMissing()
  // Export a lightweight stub to avoid runtime crash before configuration
  supabase = {
    auth: {
      async getSession() { dispatchMissing(); return { data: { session: null } } },
      async signUp() { dispatchMissing(); throw new Error('Supabase 未配置：缺少 URL 或 anon key') },
      async signInWithPassword() { dispatchMissing(); throw new Error('Supabase 未配置：缺少 URL 或 anon key') },
      async signOut() { return {} },
    },
    schema() {
      dispatchMissing();
      // minimal chain-compatible stub
      const chain = {
        from() { return chain },
        select() { dispatchMissing(); throw new Error('Supabase 未配置：读取失败') },
        insert() { dispatchMissing(); throw new Error('Supabase 未配置：写入失败') },
        update() { dispatchMissing(); throw new Error('Supabase 未配置：更新失败') },
        eq() { return chain },
        order() { return chain },
      }
      return chain
    },
  }
} else {
  supabase = createClient(supabaseUrl, supabaseAnonKey)
}

export { supabase }
