/*  
识别库
将对应属性的类型映射为控件渲染,控件状态改变自动触发依赖的属性改变，刷新图表数据
*/
import TextStyle from "./../components/echart-attr-mapping/attr-object/textStyle.vue";
import MySwitch from "./../components/echart-attr-mapping/ui-status/MySwitch.vue";
import MySelect from "./../components/echart-attr-mapping/ui-status/MySelect.vue";
import MyColorPicker from "./../components/echart-attr-mapping/ui-status/MyColorPick.vue";
import AxisLine from "./../components/echart-attr-mapping/attr-object/AxisLine.vue";
import inputData from "./Input-data";
import ShadowBlur from "./../components/echart-attr-mapping/attr-object/shadowBlur.vue";
import AxisTick from "./../components/echart-attr-mapping/attr-object/axisTick.vue";
import LineStyle from "./../components/echart-attr-mapping/attr-object/lineStyle.vue";
import SplitArea from "./../components/echart-attr-mapping/attr-object/split-area.vue";
import config from "./config";

const { InputTypes } = config;
const InputTypesMapping = {
  //组件映射，避免频繁判断渲染
  BOOLEAN: MySwitch,
  COLOR: MyColorPicker,
  SELECT: MySelect,
  TEXTSTYLE: TextStyle,
  AXISLINE: AxisLine,
  SHADOWBLUR: ShadowBlur,
  AXISTICK: AxisTick,
  AXISLABEL: TextStyle,
  LINESTYLE: LineStyle,
  SPLITAREA: SplitArea,
};
export default function generateInput(h, cb, descOption, val, type, key) {
  // console.log("generateInput:", descOption, type);
  switch (type) {
    case InputTypes.STRING: //简单的字符串
      return (
        <label>
          {descOption}:
          <input
            onInput={(e) => {
              cb(e.target.value);
            }}
            value={val}
          />
        </label>
      );
    case InputTypes.NUMBER: //简单的数字
      return (
        <label>
          {descOption}:
          <input
            type="number"
            onInput={(e) => {
              cb(parseInt(e.target.value));
            }}
            value={val}
          />
        </label>
      );
    case InputTypes.ARRAYDATA: //数据集
      return (
        <label>
          {descOption}:
          <input
            onInput={(e) => {
              cb(e.target.value.split(","));
            }}
            value={val}
          />
        </label>
      );
    case InputTypes.SELECT: //下拉框选项
      return inputData[key] ? (
        <span>
          {descOption}
          <MySelect
            options={inputData[key]}
            val={val}
            setOption={(val) => {
              cb(val);
            }}
          />
        </span>
      ) : (
        <h4>{key}未被识别的下拉框</h4>
      );
    default:
      if (InputTypesMapping[type]) {
        var PType = InputTypesMapping[type];
        return (
          <span>
            {descOption}:
            <PType
              value={val}
              onCb={(val) => {
                cb(val);
              }}
            />
          </span>
        );
      } else {
        return <h3>{type}:未加入识别库的对象</h3>;
      }
  }
}
