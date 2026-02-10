<template>
  <div class="payment-order-card">
    <div class="order-header">
      <i class="fa-solid fa-credit-card text-blue-500"></i>
      <span class="header-text">待支付订单清单</span>
      <span class="order-count">{{ orders.length }}个订单</span>
    </div>
    
    <div class="order-list">
      <div 
        v-for="order in orders" 
        :key="order.id" 
        class="order-item"
        :class="{ 'paid': order.status === 'paid', 'cancelled': order.status === 'cancelled' }"
      >
        <div class="order-icon">
          <i 
            class="fa-solid" 
            :class="order.type === 'flight' ? 'fa-plane' : 'fa-hotel'"
          ></i>
        </div>
        
        <div class="order-info">
          <div class="order-title">{{ order.title }}</div>
          <div class="order-details">{{ order.details }}</div>
        </div>
        
        <div class="order-price">
          <span class="price-symbol">¥</span>
          <span class="price-amount">{{ order.price }}</span>
        </div>
        
        <div class="order-actions">
          <button 
            v-if="order.status === 'pending'"
            @click="handlePay(order)"
            class="pay-button"
          >
            <i class="fa-solid fa-credit-card"></i>
            去支付
          </button>
          <span v-else-if="order.status === 'paid'" class="status-badge paid">
            <i class="fa-solid fa-check"></i> 已支付
          </span>
          <span v-else class="status-badge cancelled">
            <i class="fa-solid fa-ban"></i> 已取消
          </span>
        </div>
      </div>
    </div>
    
    <div class="order-footer">
      <div class="total-amount">
        <span class="total-label">总金额：</span>
        <span class="total-price">¥{{ totalAmount }}</span>
      </div>
      <button 
        v-if="hasUnpaidOrders"
        @click="handlePayAll"
        class="pay-all-button"
      >
        <i class="fa-solid fa-wallet"></i>
        全部支付
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { PaymentOrderData } from '../../types/message'

const props = defineProps<{
  data: PaymentOrderData
}>()

const orders = computed(() => props.data.orders)
const totalAmount = computed(() => props.data.totalAmount)
const hasUnpaidOrders = computed(() => 
  props.data.orders.some(o => o.status === 'pending')
)

const handlePay = (order: typeof props.data.orders[0]) => {
  // 打开支付链接
  window.open(order.paymentUrl, '_blank')
}

const handlePayAll = () => {
  // 批量打开所有待支付订单的支付链接
  props.data.orders
    .filter(o => o.status === 'pending')
    .forEach(order => {
      window.open(order.paymentUrl, '_blank')
    })
}
</script>

<style scoped>
.payment-order-card {
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 16px;
  margin: 12px 0;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.order-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-bottom: 12px;
  border-bottom: 2px solid #f3f4f6;
  margin-bottom: 16px;
}

.header-text {
  font-weight: 600;
  font-size: 15px;
  color: #374151;
}

.order-count {
  font-size: 12px;
  color: #6b7280;
  background: #f3f4f6;
  padding: 2px 8px;
  border-radius: 12px;
}

.order-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 16px;
}

.order-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: #f9fafb;
  border-radius: 8px;
  border: 1px solid #e5e7eb;
  transition: all 0.2s;
}

.order-item:hover {
  background: #f3f4f6;
  border-color: #d1d5db;
}

.order-item.paid {
  opacity: 0.6;
  background: #f0fdf4;
}

.order-item.cancelled {
  opacity: 0.4;
  background: #fef2f2;
}

.order-icon {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: 8px;
  color: white;
  font-size: 18px;
}

.order-info {
  flex: 1;
  min-width: 0;
}

.order-title {
  font-weight: 600;
  font-size: 14px;
  color: #111827;
  margin-bottom: 4px;
}

.order-details {
  font-size: 12px;
  color: #6b7280;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.order-price {
  display: flex;
  align-items: baseline;
  gap: 2px;
  font-weight: 700;
  color: #ef4444;
}

.price-symbol {
  font-size: 14px;
}

.price-amount {
  font-size: 18px;
}

.order-actions {
  flex-shrink: 0;
}

.pay-button {
  padding: 8px 16px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
  transition: all 0.2s;
}

.pay-button:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
}

.pay-button:active {
  transform: translateY(0);
}

.status-badge {
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 4px;
}

.status-badge.paid {
  background: #d1fae5;
  color: #065f46;
}

.status-badge.cancelled {
  background: #fee2e2;
  color: #991b1b;
}

.order-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 16px;
  border-top: 2px solid #f3f4f6;
}

.total-amount {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.total-label {
  font-size: 14px;
  color: #6b7280;
}

.total-price {
  font-size: 24px;
  font-weight: 700;
  color: #ef4444;
}

.pay-all-button {
  padding: 10px 20px;
  background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  transition: all 0.2s;
}

.pay-all-button:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(245, 158, 11, 0.4);
}

.pay-all-button:active {
  transform: translateY(0);
}
</style>
