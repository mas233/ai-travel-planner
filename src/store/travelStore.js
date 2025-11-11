import { create } from 'zustand'
import { supabase } from '../lib/supabase'

export const useTravelStore = create((set, get) => ({
  plans: [],
  currentPlan: null,
  loading: false,

  fetchPlans: async (userId) => {
    set({ loading: true })
    try {
      const { data, error } = await supabase
        .schema('travel_planner')
        .from('travel_plans')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
      
      if (error) {
        console.error('❌ [数据库错误]', error)
        throw error
      }
      set({ plans: data || [], loading: false })
    } catch (error) {
      console.error('❌ [数据库读取失败] Error fetching plans:', error)
      set({ loading: false })
    }
  },

  createPlan: async (planData) => {
    try {
      const { data, error } = await supabase
        .schema('travel_planner')
        .from('travel_plans')
        .insert([planData])
        .select()
      
      if (error) throw error
      set(state => ({ plans: [data[0], ...state.plans] }))
      return data[0]
    } catch (error) {
      console.error('❌ [数据库写入失败] Error creating plan:', error)
      throw error
    }
  },

  updatePlan: async (id, updates) => {
    try {
      const { data, error } = await supabase
        .schema('travel_planner')
        .from('travel_plans')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
      
      if (error) throw error
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
      const { data, error } = await supabase
        .schema('travel_planner')
        .from('expenses')
        .insert([expense])
        .select()
      
      if (error) throw error
      return data[0]
    } catch (error) {
      console.error('❌ [数据库写入失败] Error adding expense:', error)
      throw error
    }
  },

  fetchExpenses: async (planId) => {
    try {
      const { data, error } = await supabase
        .schema('travel_planner')
        .from('expenses')
        .select('*')
        .eq('plan_id', planId)
        .order('date', { ascending: false })
      
      if (error) throw error
      return data || []
    } catch (error) {
      console.error('❌ [数据库读取失败] Error fetching expenses:', error)
      return []
    }
  },
}))
