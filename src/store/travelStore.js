import { create } from 'zustand'
import { supabase } from '../lib/supabase'

export const useTravelStore = create((set, get) => ({
  plans: [],
  currentPlan: null,
  loading: false,

  fetchPlans: async (userId) => {
    set({ loading: true })
    try {
      console.log('🔍 [数据库读取] 开始获取旅行计划，用户ID:', userId)
      
      const { data, error } = await supabase
        .schema('travel_planner')
        .from('travel_plans')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
      
      // 🔴 断点位置 1: 在这里打断点可以查看数据库原始响应
      console.log('📦 [数据库原始响应] 完整响应对象:', { data, error })
      console.log('📊 [数据库原始数据] data 数组:', data)
      console.log('📋 [数据库原始数据] 数据条数:', data?.length || 0)
      
      if (data && data.length > 0) {
        console.log('📝 [数据库原始数据] 第一条记录的完整结构:')
        console.log(JSON.stringify(data[0], null, 2))
        console.log('🔑 [数据库原始数据] 所有字段名:', Object.keys(data[0]))
      }
      
      if (error) {
        console.error('❌ [数据库错误]', error)
        throw error
      }
      
      console.log('✅ [数据库读取完成] 成功获取', data?.length || 0, '条计划')
      set({ plans: data || [], loading: false })
    } catch (error) {
      console.error('❌ [数据库读取失败] Error fetching plans:', error)
      set({ loading: false })
    }
  },

  createPlan: async (planData) => {
    try {
      console.log('➕ [数据库写入] 开始创建旅行计划')
      console.log('📤 [数据库写入] 发送的数据:', JSON.stringify(planData, null, 2))
      
      const { data, error } = await supabase
        .schema('travel_planner')
        .from('travel_plans')
        .insert([planData])
        .select()
      
      // 🔴 断点位置 2: 在这里打断点可以查看创建后的数据库响应
      console.log('📦 [数据库原始响应] 创建后的完整响应:', { data, error })
      if (data && data[0]) {
        console.log('📝 [数据库原始数据] 创建后的记录完整结构:')
        console.log(JSON.stringify(data[0], null, 2))
      }
      
      if (error) throw error
      console.log('✅ [数据库写入完成] 计划创建成功，ID:', data[0]?.id)
      set(state => ({ plans: [data[0], ...state.plans] }))
      return data[0]
    } catch (error) {
      console.error('❌ [数据库写入失败] Error creating plan:', error)
      throw error
    }
  },

  updatePlan: async (id, updates) => {
    try {
      console.log('✏️ [数据库更新] 开始更新计划，ID:', id)
      console.log('📤 [数据库更新] 更新内容:', JSON.stringify(updates, null, 2))
      
      const { data, error } = await supabase
        .schema('travel_planner')
        .from('travel_plans')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
      
      // 🔴 断点位置 3: 在这里打断点可以查看更新后的数据库响应
      console.log('📦 [数据库原始响应] 更新后的完整响应:', { data, error })
      if (data && data[0]) {
        console.log('📝 [数据库原始数据] 更新后的记录完整结构:')
        console.log(JSON.stringify(data[0], null, 2))
      }
      
      if (error) throw error
      console.log('✅ [数据库更新完成] 计划更新成功')
      set(state => ({
        plans: state.plans.map(p => p.id === id ? data[0] : p),
        currentPlan: state.currentPlan?.id === id ? data[0] : state.currentPlan
      }))
      return data[0]
    } catch (error) {
      console.error('❌ [数据库更新失败] Error updating plan:', error)
      throw error
    }
  },

  deletePlan: async (id) => {
    try {
      const { error } = await supabase
        .schema('travel_planner')
        .from('travel_plans')
        .delete()
        .eq('id', id)
      
      if (error) throw error
      set(state => ({
        plans: state.plans.filter(p => p.id !== id),
        currentPlan: state.currentPlan?.id === id ? null : state.currentPlan
      }))
    } catch (error) {
      console.error('Error deleting plan:', error)
      throw error
    }
  },

  setCurrentPlan: (plan) => {
    set({ currentPlan: plan })
  },

  // Expenses management
  addExpense: async (expense) => {
    try {
      console.log('➕ [数据库写入] 开始添加开销记录')
      console.log('📤 [数据库写入] 发送的开销数据:', JSON.stringify(expense, null, 2))
      
      const { data, error } = await supabase
        .schema('travel_planner')
        .from('expenses')
        .insert([expense])
        .select()
      
      // 🔴 断点位置 5: 在这里打断点可以查看添加开销后的数据库响应
      console.log('📦 [数据库原始响应] 添加开销后的完整响应:', { data, error })
      if (data && data[0]) {
        console.log('📝 [数据库原始数据] 添加后的开销记录完整结构:')
        console.log(JSON.stringify(data[0], null, 2))
      }
      
      if (error) throw error
      console.log('✅ [数据库写入完成] 开销记录添加成功，ID:', data[0]?.id)
      return data[0]
    } catch (error) {
      console.error('❌ [数据库写入失败] Error adding expense:', error)
      throw error
    }
  },

  fetchExpenses: async (planId) => {
    try {
      console.log('💰 [数据库读取] 开始获取开销记录，计划ID:', planId)
      
      const { data, error } = await supabase
        .schema('travel_planner')
        .from('expenses')
        .select('*')
        .eq('plan_id', planId)
        .order('date', { ascending: false })
      
      // 🔴 断点位置 4: 在这里打断点可以查看开销数据的原始响应
      console.log('📦 [数据库原始响应] 开销数据完整响应:', { data, error })
      console.log('📊 [数据库原始数据] 开销数据条数:', data?.length || 0)
      if (data && data.length > 0) {
        console.log('📝 [数据库原始数据] 第一条开销记录的完整结构:')
        console.log(JSON.stringify(data[0], null, 2))
      }
      
      if (error) throw error
      console.log('✅ [数据库读取完成] 成功获取', data?.length || 0, '条开销记录')
      return data || []
    } catch (error) {
      console.error('❌ [数据库读取失败] Error fetching expenses:', error)
      return []
    }
  },
}))