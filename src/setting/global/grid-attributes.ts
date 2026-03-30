import config from "../config";
const { InputTypes } = config;

export default {
  grid: {
    show: InputTypes.BOOLEAN,
    left: InputTypes.STRING,
    top: InputTypes.STRING,
    width: InputTypes.STRING,
    height: InputTypes.STRING,
    containLabel: InputTypes.BOOLEAN,
    backgroundColor: InputTypes.COLOR,
    borderColor: InputTypes.COLOR,
    borderWidth: InputTypes.NUMBER,
    shadowBlur: InputTypes.SHADOWBLUR,
    shadowColor: InputTypes.COLOR,
    shadowOffsetX: InputTypes.NUMBER,
    shadowOffsetY: InputTypes.NUMBER,
  },
};
