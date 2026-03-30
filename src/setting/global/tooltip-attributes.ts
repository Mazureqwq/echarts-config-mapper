import config from "../config";

const { InputTypes } = config;

export default {
  tooltip: {
    show: InputTypes.BOOLEAN,
    // position: InputTypes.ARRAYDATA,
    trigger: InputTypes.SELECT,
    alwaysShowContent: InputTypes.BOOLEAN,
    triggerOn: InputTypes.SELECT,
    formatter: InputTypes.STRING,
    backgroundColor: InputTypes.COLOR,
    borderColor: InputTypes.COLOR,
    borderWidth: InputTypes.NUMBER,
    padding: InputTypes.NUMBER,
    textStyle: InputTypes.TEXTSTYLE,
  },
};
