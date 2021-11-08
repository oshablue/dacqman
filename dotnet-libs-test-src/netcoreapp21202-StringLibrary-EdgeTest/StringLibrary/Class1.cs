using System;
using System.Threading.Tasks;



namespace StringLibrary
{
    // <BEGIN>
    // https://github.com/tjanczuk/edge/blob/master/samples/Sample105.cs
    public class Startup
    {
        public async Task<object> Invoke(object input)
		{
			return this.StartsWithUpper((string)input);
		}
        bool StartsWithUpper(string str)
        {
            return Helper.StartsWithUpper(str);
        }
    }

    static class Helper
    {
        public static bool StartsWithUpper(string str)
        {
            if (string.IsNullOrWhiteSpace(str))
                return false;

            char ch = str[0];
            return char.IsUpper(ch);
        }
    }
    // <END>

    // <BEGIN> https://docs.microsoft.com/en-us/archive/msdn-magazine/2016/may/the-working-programmer-how-to-be-mean-getting-the-edge-js
    public class Test
    {
        public async Task<object> CountLength(object input) 
        {
            byte[] dataIn = (byte[])input;
            return dataIn.Length;
        }
    }
    // <END>
}