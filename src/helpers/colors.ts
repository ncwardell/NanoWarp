export function setColor(_input: string, _color: string) {
    switch (_color) {
        case 'red':
            return "\x1b[31m" + _input + "\x1b[0m";
        case 'green':
            return "\x1b[32m" + _input + "\x1b[0m";
        case 'yellow':
            return "\x1b[33m" + _input + "\x1b[0m";
        case 'orange':
            return "\x1b[38;2;255;165;0m" + _input + "\x1b[0m";
        case 'blue':
            return "\x1b[34m" + _input + "\x1b[0m";
        case 'magenta':
            return "\x1b[35m" + _input + "\x1b[0m";
        case 'cyan':
            return "\x1b[36m" + _input + "\x1b[0m";
        case 'white':
            return "\x1b[37m" + _input + "\x1b[0m";
        case 'reset':
            return "\x1b[0m" + _input + "\x1b[0m";
        default:
            return "\x1b[0m" + _input + "\x1b[0m";
    }
}