<template>
  <div :class="isOpen ? 'normal' : 'close'">
    <div @click="isOpen = !isOpen" :style="{
      fontSize: '14px', cursor: 'pointer', color: '#409eff'
    }">点击{{ isOpen ? '收起' : '展开' }}>></div>
    <div :style="{
      padding: '0 15px'
    }">
      <div>
        文字颜色：
        <MyColorPicker :value="textStyle.color" @cb="(val) => (textStyle.color = val)" />
      </div>
      <div>
        文字大小：
        <ElInputNumber v-model="textStyle.fontSize" />
      </div>
      <div>
        字体:
        <ElSelect v-model="textStyle.fontFamily" placeholder="请选择">
          <ElOption v-for="item in options" :key="item.value" :label="item.label" :value="item.value" />
        </ElSelect>
      </div>
      <div class="">
        文字描边颜色：
        <MyColorPicker :value="textStyle.textBorderColor" @cb="(val) => (textStyle.textBorderColor = val)" />
      </div>
      <div class="">
        文字描边大小：
        <ElInputNumber v-model="textStyle.textBorderWidth" />
      </div>
      <div class="">
        文字阴影颜色：
        <MyColorPicker :value="textStyle.textShadowColor" @cb="(val) => (textStyle.textShadowColor = val)" />
      </div>
      <div class="">
        文字阴影大小：
        <ElInputNumber v-model="textStyle.textShadowBlur" />
      </div>
      <div class="">
        文字阴影横向偏移：
        <ElInputNumber v-model="textStyle.textShadowOffsetX" />
      </div>
      <div class="">
        文字阴影纵向偏移：
        <ElInputNumber v-model="textStyle.textShadowOffsetY" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from "vue";
import { ElInputNumber, ElSelect, ElOption } from "element-plus";
import MyColorPicker from "./../ui-status/MyColorPick.vue";
import { OptionItem, TextStyle } from "@/components/types";

const props = defineProps<{
  value: TextStyle | undefined;
}>();

const emit = defineEmits<{
  (e: "cb", val: TextStyle): void;
}>();

const isOpen = ref<boolean>(false);
const options = ref<OptionItem[]>([
  {
    value: "微软雅黑",
    label: "Microsoft YaHei",
  },
  {
    value: "SimHei",
    label: "黑体",
  },
  {
    value: "KaiTi",
    label: "楷体",
  },
]);

const textStyle = ref<TextStyle>({
  color: "#333",
  fontSize: 15,
  fontFamily: "Microsoft YaHei",
  textBorderWidth: 0,
  textBorderColor: "red",
  textShadowColor: "rgba(0,0,0,0)",
  textShadowBlur: 0,
  textShadowOffsetX: 0,
  textShadowOffsetY: 0,
});

watch(
  () => props.value,
  (newVal) => {
    if (newVal) {
      textStyle.value = newVal;
    }
  },
  { deep: true, immediate: true },
);

watch(
  textStyle,
  (newVal) => {
    emit("cb", newVal);
  },
  { deep: true },
);

</script>

<style scoped></style>
