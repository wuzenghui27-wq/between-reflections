// 像素图的导入规则：Point 过滤、不压缩、没有 mipmap、不改尺寸、统一 16 像素一单位。
// 本项目的画面在运行时自己解码 PNG 合成，不走纹理导入；这条规则管以后放进 Assets 的任何图，防止糊边。
using UnityEditor;
using UnityEngine;

namespace BR.Tools
{
    public class ImportRules : AssetPostprocessor
    {
        public const int PPU = 16;

        void OnPreprocessTexture()
        {
            var ti = (TextureImporter)assetImporter;
            ti.filterMode = FilterMode.Point;
            ti.mipmapEnabled = false;
            ti.textureCompression = TextureImporterCompression.Uncompressed;
            ti.npotScale = TextureImporterNPOTScale.None;
            ti.anisoLevel = 0;
            ti.spritePixelsPerUnit = PPU;
            ti.alphaIsTransparency = true;
            ti.maxTextureSize = 8192;
        }
    }
}
