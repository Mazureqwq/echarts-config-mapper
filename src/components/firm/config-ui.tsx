import { defineComponent, computed, ref, watch, h } from "vue";
import generateInput from "../../setting/generate";

// 动态模块加载（Vite 推荐）
const descModules = import.meta.glob("../../setting/attrs-desc/*.ts", {
  eager: true,
});
const attrModules = import.meta.glob("../../setting/attributes/*.ts", {
  eager: true,
});
const configModules = import.meta.glob("../../setting/config.ts", {
  eager: true,
});
const uiModules = import.meta.glob("../echart-attr-mapping/ui-status/*.vue", {
  eager: true,
});

export default defineComponent({
  name: "ConfigUi",
  props: {
    curOption: {
      type: Object,
      required: true,
    },
  },
  setup(props) {
    const curOptionKey = ref("title");
    // watch(
    //   () => props.curOption,
    //   (val) => {
    //     console.log("当前 curOption:", val);
    //   },
    // );
    const type = computed(() => props.curOption?.type);
    const echartOption = computed(() => props.curOption?.echartOption);

    // ✅ 动态获取模块
    // const descOption = computed(async () => {
    //   const path = `../../setting/attrs-desc/${type.value}.ts`;
    //   console.log("descOption:", descModules, type.value, descModules[path]);
    //   const loader = descModules[path];
    //   const module = await loader();
    //   return module?.default || {};
    // });
    const descOption = (type) => {
      const path = `../../setting/attrs-desc/${type}.ts`;
      const loader = descModules[path];
      // const module = await loader();
      return loader?.default || {};
    };

    const defaultModel = computed(() => {
      const path = `../../setting/attributes/${type.value}.ts`;
      return attrModules[path]?.default || {};
    });

    const optionName =
      configModules["../../setting/config.ts"]?.default?.optionName || {};

    const ChooseType =
      uiModules["../echart-attr-mapping/ui-status/MySelect.vue"]?.default;

    // ================= 核心逻辑 =================
    const buildAttrsMapping = () => {
      const attrsMapping = {};

      const deepIn = (val, mapping, desc, option) => {
        for (const key in val) {
          if (typeof val[key] === "object" && val[key] !== null) {
            option[key] ??= {};
            mapping[key] ??= {};
            deepIn(val[key], mapping[key], desc?.[key], option[key]);
          } else {
            mapping[key] = generateInput(
              null,
              (v) => {
                option[key] = v;
                console.log("状态：" + key, v);
              },
              desc?.[key],
              option[key],
              val[key],
              key,
            );
          }
        }
      };
      if (echartOption.value) {
        deepIn(
          defaultModel.value,
          attrsMapping,
          descOption("bar"),
          echartOption.value.echartOption,
        );
      }
      return attrsMapping;
    };

    const attrsMapping = computed(() => buildAttrsMapping());

    const deepGenerateDom = (val) => {
      // console.log("deepGenerateDom", val);
      if (Object.keys(val).find((i) => i == "ctx")) return val;
      return Object.keys(val || {}).map((key) => (
        <div>{deepGenerateDom(val[key])}</div>
      ));
    };

    const setOption = (val) => {
      curOptionKey.value = val;
    };

    const options = computed(() => {
      return Object.keys(attrsMapping.value || {}).map((item) => ({
        label: optionName[item]?.name,
        value: item,
      }));
    });

    // ================= render =================
    return () => (
      <div style={{ padding: "10px" }}>
        请选择属性:
        {ChooseType && (
          <ChooseType
            options={options.value}
            val={curOptionKey.value}
            setOption={setOption}
          />
        )}
        {console.log(echartOption.value)}
        {echartOption.value &&
          Object.keys(attrsMapping.value).map((key) => (
            <div
              style={{
                display: curOptionKey.value === key ? "block" : "none",
              }}>
              {deepGenerateDom(attrsMapping.value[key])}
            </div>
          ))}
      </div>
    );
  },
});
