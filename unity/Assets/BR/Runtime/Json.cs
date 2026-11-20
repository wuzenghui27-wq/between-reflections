// 极简 JSON 解析：对象 → Dictionary<string, object>，数组 → List<object>，数 → double，其余照常。
// shared/data 里的文件结构不规则（每件东西字段不同），JsonUtility 读不了，所以自己解析。
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text;

namespace BR
{
    public static class Json
    {
        public static object Parse(string s) { int i = 0; var v = Value(s, ref i); return v; }

        static void Ws(string s, ref int i) { while (i < s.Length && char.IsWhiteSpace(s[i])) i++; }

        static object Value(string s, ref int i)
        {
            Ws(s, ref i);
            char c = s[i];
            if (c == '{') return Obj(s, ref i);
            if (c == '[') return Arr(s, ref i);
            if (c == '"') return Str(s, ref i);
            if (s.Substring(i).StartsWith("true")) { i += 4; return true; }
            if (s.Substring(i).StartsWith("false")) { i += 5; return false; }
            if (s.Substring(i).StartsWith("null")) { i += 4; return null; }
            int st = i;
            while (i < s.Length && "+-0123456789.eE".IndexOf(s[i]) >= 0) i++;
            return double.Parse(s.Substring(st, i - st), CultureInfo.InvariantCulture);
        }

        static Dictionary<string, object> Obj(string s, ref int i)
        {
            var d = new Dictionary<string, object>();
            i++; Ws(s, ref i);
            if (s[i] == '}') { i++; return d; }
            while (true)
            {
                Ws(s, ref i); string k = Str(s, ref i); Ws(s, ref i); i++;      // ':'
                d[k] = Value(s, ref i); Ws(s, ref i);
                if (s[i] == ',') { i++; continue; }
                i++; return d;                                                  // '}'
            }
        }

        static List<object> Arr(string s, ref int i)
        {
            var a = new List<object>();
            i++; Ws(s, ref i);
            if (s[i] == ']') { i++; return a; }
            while (true)
            {
                a.Add(Value(s, ref i)); Ws(s, ref i);
                if (s[i] == ',') { i++; continue; }
                i++; return a;
            }
        }

        static string Str(string s, ref int i)
        {
            var sb = new StringBuilder(); i++;
            while (s[i] != '"')
            {
                if (s[i] == '\\')
                {
                    i++;
                    char e = s[i];
                    if (e == 'u') { sb.Append((char)Convert.ToInt32(s.Substring(i + 1, 4), 16)); i += 4; }
                    else sb.Append(e == 'n' ? '\n' : e == 't' ? '\t' : e == 'r' ? '\r' : e == 'b' ? '\b' : e == 'f' ? '\f' : e);
                }
                else sb.Append(s[i]);
                i++;
            }
            i++; return sb.ToString();
        }

        // 取值小工具
        public static Dictionary<string, object> O(object o) => (Dictionary<string, object>)o;
        public static List<object> A(object o) => (List<object>)o;
        public static double D(object o) => Convert.ToDouble(o, CultureInfo.InvariantCulture);
        public static int I(object o) => (int)Math.Round(D(o));
        public static string S(object o) => o as string ?? "";
        public static object G(Dictionary<string, object> d, string k) => d.TryGetValue(k, out var v) ? v : null;
    }
}
