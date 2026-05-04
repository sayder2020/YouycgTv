import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { ChannelGrid } from './components/ChannelGrid';
import { PlayerView } from './components/PlayerView';
import { SourceEditor } from './components/SourceEditor'; 
import type { TVCategory, TVChannel } from './types';
import { AlertTriangleIcon, LoaderIcon as AppLoaderIcon, ListIcon } from './components/icons';

const DEFAULT_M3U_URL = 'https://m3.indeed.ccwu.cc/123456';
const LOCAL_STORAGE_CUSTOM_M3U_URL_KEY = 'customM3uUrl';

// Simple hash function for generating fallback IDs
const simpleHash = (str: string): number => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0; // Convert to 32bit integer
  }
  return Math.abs(hash);
};

export const App: React.FC = () => {
  const [m3uSourceUrl, setM3uSourceUrl] = useState<string>(() => {
    return localStorage.getItem(LOCAL_STORAGE_CUSTOM_M3U_URL_KEY) || DEFAULT_M3U_URL;
  });
  const [isSourceEditorOpen, setIsSourceEditorOpen] = useState<boolean>(false);
  
  const [categories, setCategories] = useState<TVCategory[]>([]);
  const [selectedCategoryName, setSelectedCategoryName] = useState<string | null>(null);
  const [currentChannel, setCurrentChannel] = useState<TVChannel | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (urlToFetch: string) => {
    setIsLoading(true);
    setError(null);
    setCategories([]); 
    setSelectedCategoryName(null);
    setCurrentChannel(null);

    console.log(`Fetching M3U data from: ${urlToFetch}`);

    try {
      const response = await fetch(urlToFetch);
      if (!response.ok) {
        throw new Error(`网络请求失败: ${response.status} ${response.statusText} (URL: ${urlToFetch})`);
      }
      const m3uText = await response.text();
      console.log("Raw M3U Text:", m3uText.substring(0, 500) + (m3uText.length > 500 ? "..." : ""));

      const lines = m3uText.split(/\r\n|\r|\n/);
      const parsedChannelsByCategory: { [key: string]: TVChannel[] } = {};
      let currentChannelInfo: Partial<TVChannel> = {};
      let explicitChannelName = '';

      for (const line of lines) {
        const trimmedLine = line.trim();
        if (trimmedLine.startsWith('#EXTINF:')) {
          currentChannelInfo = { category: '未知分类' }; 
          explicitChannelName = '';

          const infoLine = trimmedLine.substring(8).trim(); 
          const commaLastIndex = infoLine.lastIndexOf(',');
          
          if (commaLastIndex !== -1) {
            explicitChannelName = infoLine.substring(commaLastIndex + 1).trim();
            const attributesString = infoLine.substring(0, commaLastIndex);

            const tvgIdMatch = attributesString.match(/tvg-id="([^"]*)"/i);
            if (tvgIdMatch && tvgIdMatch[1]) currentChannelInfo.id = tvgIdMatch[1].trim();

            const tvgNameMatch = attributesString.match(/tvg-name="([^"]*)"/i);
            if (tvgNameMatch && tvgNameMatch[1]) currentChannelInfo.name = tvgNameMatch[1].trim();
            
            const logoMatch = attributesString.match(/tvg-logo="([^"]*)"/i);
            if (logoMatch && logoMatch[1]) currentChannelInfo.logoUrl = logoMatch[1].trim();
            
            const groupTitleMatch = attributesString.match(/group-title="([^"]*)"/i);
            if (groupTitleMatch && groupTitleMatch[1]) currentChannelInfo.category = groupTitleMatch[1].trim() || '未知分类';
          }
          
          if (!currentChannelInfo.name && explicitChannelName) {
            currentChannelInfo.name = explicitChannelName;
          }
          if (!currentChannelInfo.name) {
            currentChannelInfo.name = "未命名频道";
          }

        } else if (trimmedLine && !trimmedLine.startsWith('#')) { 
          const url = trimmedLine;

          // Filter out insecure (http) or unsupported protocols to avoid mixed-content blocks in HTTPS.
          if (!/^https:\/\//i.test(url)) {
            currentChannelInfo = {};
            explicitChannelName = '';
            continue;
          }

          currentChannelInfo.streamUrl = url;

          if (currentChannelInfo.name && currentChannelInfo.streamUrl) {
            if (!currentChannelInfo.id) {
              const idBase = `${currentChannelInfo.category}-${currentChannelInfo.name}-${currentChannelInfo.streamUrl}`;
              currentChannelInfo.id = `channel-${simpleHash(idBase)}`;
            }

            const categoryName = currentChannelInfo.category || '未知分类';
            if (!parsedChannelsByCategory[categoryName]) {
              parsedChannelsByCategory[categoryName] = [];
            }
            // Prevent duplicates by checking ID
            if (!parsedChannelsByCategory[categoryName].find(ch => ch.id === currentChannelInfo.id)) {
                 parsedChannelsByCategory[categoryName].push(currentChannelInfo as TVChannel);
            }
          }
          currentChannelInfo = {};
          explicitChannelName = '';
        }
      }

      const finalCategories: TVCategory[] = Object.keys(parsedChannelsByCategory)
        .filter(name => parsedChannelsByCategory[name].length > 0)
        .map(name => ({
          name,
          channels: parsedChannelsByCategory[name].sort((a,b) => a.name.localeCompare(b.name)),
        }))
        .sort((a,b) => a.name.localeCompare(b.name));

      setCategories(finalCategories);
      if (finalCategories.length > 0) {
        setSelectedCategoryName(finalCategories[0].name);
      } else {
        setError("未找到任何频道数据或无法解析。请检查源是否有效且格式正确。");
      }

    } catch (e: any) {
      console.error("获取或解析电视数据失败:", e);
      setError(`数据加载失败: ${e.message}. 请检查网络连接、URL是否正确并允许跨域访问 (CORS), 或浏览器控制台获取更多信息。`);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(m3uSourceUrl);
  }, [m3uSourceUrl, fetchData]);

  const handleSelectCategory = useCallback((categoryName: string) => {
    setSelectedCategoryName(categoryName);
    setCurrentChannel(null);
  }, []);

  const handleSelectChannel = useCallback((channel: TVChannel) => {
    setCurrentChannel(channel);
  }, []);

  const toggleSourceEditor = () => {
    setIsSourceEditorOpen(!isSourceEditorOpen);
  };

  const handleSubmitSource = (newUrl: string) => {
    if (newUrl && newUrl.trim() !== m3uSourceUrl) {
      setM3uSourceUrl(newUrl.trim());
      localStorage.setItem(LOCAL_STORAGE_CUSTOM_M3U_URL_KEY, newUrl.trim());
    }
    setIsSourceEditorOpen(false);
  };

  const handleResetSource = () => {
    setM3uSourceUrl(DEFAULT_M3U_URL);
    localStorage.removeItem(LOCAL_STORAGE_CUSTOM_M3U_URL_KEY);
    setIsSourceEditorOpen(false);
  };

  const channelsForSelectedCategory = useMemo(() => {
    return categories.find(cat => cat.name === selectedCategoryName)?.channels || [];
  }, [categories, selectedCategoryName]);

  if (isLoading) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-neutral-950/70 backdrop-blur-sm text-center p-4">
        <AppLoaderIcon className="w-12 h-12 text-sky-400 animate-spin mr-4" />
        <p className="text-xl text-neutral-300 mt-4">正在加载频道...</p>
      </div>
    );
  }

  const renderFeedbackScreen = (icon: JSX.Element, title: string, message: string, details?: string) => (
    <div className="h-screen flex flex-col items-center justify-center bg-neutral-950/70 backdrop-blur-sm text-center p-6">
      <div className="bg-neutral-800/80 p-8 rounded-xl shadow-2xl max-w-md w-full">
        {icon}
        <h2 className="text-2xl font-semibold text-neutral-100 mb-3">{title}</h2>
        <p className="text-neutral-300 mb-2 whitespace-pre-wrap text-sm">{message}</p>
        {details && <p className="text-neutral-400 text-xs mt-1 mb-4">{details}</p>}
        <button 
          onClick={toggleSourceEditor} 
          className="mt-4 bg-sky-600 hover:bg-sky-500 text-white font-medium py-2.5 px-5 rounded-lg flex items-center justify-center gap-2 transition-all duration-150 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-800 shadow-md hover:shadow-lg"
        >
          <ListIcon className="w-5 h-5" />
          修改直播源
        </button>
      </div>
      {isSourceEditorOpen && (
        <SourceEditor
          isOpen={isSourceEditorOpen}
          currentUrl={m3uSourceUrl}
          defaultUrl={DEFAULT_M3U_URL}
          onSubmit={handleSubmitSource}
          onReset={handleResetSource}
          onClose={toggleSourceEditor}
        />
      )}
    </div>
  );
  
  if (error && categories.length === 0) {
    return renderFeedbackScreen(
      <AlertTriangleIcon className="w-16 h-16 text-red-500 mb-4" />,
      "加载错误",
      error
    );
  }
  
  if (categories.length === 0 && !isLoading && !error) {
     return renderFeedbackScreen(
      <AlertTriangleIcon className="w-16 h-16 text-yellow-500 mb-4" />,
      "无频道数据",
      "未能从当前源加载任何频道信息。",
      "请确保源地址有效且格式正确。"
    );
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <Header onToggleSourceEditor={toggleSourceEditor} />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          categories={categories}
          activeCategoryName={selectedCategoryName}
          onSelectCategory={handleSelectCategory}
        />
        <main className="flex-1 overflow-y-auto p-3 md:p-4 bg-neutral-900/80 backdrop-blur-sm"> 
          {currentChannel ? (
            <PlayerView channel={currentChannel} />
          ) : (
            <ChannelGrid 
              channels={channelsForSelectedCategory} 
              onSelectChannel={handleSelectChannel} 
            />
          )}
        </main>
      </div>
      {isSourceEditorOpen && (
        <SourceEditor
          isOpen={isSourceEditorOpen}
          currentUrl={m3uSourceUrl}
          defaultUrl={DEFAULT_M3U_URL}
          onSubmit={handleSubmitSource}
          onReset={handleResetSource}
          onClose={toggleSourceEditor}
        />
      )}
    </div>
  );
};
