import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import axios from 'axios';
import { withApiBaseUrl } from '../lib/api-client';

type SessionUserWithId = {
  id?: string;
};

interface ModelsProps {
  userId: string;
}

interface Live2DModel {
  id: string;
  name: string;
  path: string;
  isCustom: boolean;
  uploadedBy: string;
  uploaderName: string;
  price: number;
  downloads: number;
  rating: number;
  tags: string[];
  description: string;
  previewImage?: string;
}

const Models: React.FC<ModelsProps> = ({ userId }) => {
  const { data: session } = useSession();
  const sessionUserId = (session?.user as SessionUserWithId | undefined)?.id;
  const [loading, setLoading] = useState(true);
  const [currentModel, setCurrentModel] = useState<Live2DModel | null>(null);
  const [availableModels, setAvailableModels] = useState<Live2DModel[]>([]);
  const [marketModels, setMarketModels] = useState<Live2DModel[]>([]);
  const [uploadingModel, setUploadingModel] = useState(false);
  const [shareToCommunity, setShareToCommunity] = useState(false);
  const [modelPrice, setModelPrice] = useState(10);
  const [userCredit, setUserCredit] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchAvailableModels = useCallback(async () => {
    try {
      const systemModels: Live2DModel[] = [
        {
          id: 'koharu',
          name: '小春',
          path: '/live2d/koharu/',
          isCustom: false,
          uploadedBy: 'system',
          uploaderName: '系统',
          price: 0,
          downloads: 0,
          rating: 5.0,
          tags: ['默认', '可爱'],
          description: '系统自带的默认Live2D模型'
        }
      ];

      if (sessionUserId) {
        const ownedResponse = await axios.get(withApiBaseUrl(`/api/ugc/models/owned/${sessionUserId}`));
        const ownedModels: Live2DModel[] = ownedResponse.data.success ? ownedResponse.data.models : [];
        setAvailableModels([...systemModels, ...ownedModels]);
      } else {
        setAvailableModels(systemModels);
      }
    } catch (error) {
      console.error('Failed to fetch models:', error);
      setAvailableModels([{
        id: 'koharu',
        name: '小春',
        path: '/live2d/koharu/',
        isCustom: false,
        uploadedBy: 'system',
        uploaderName: '系统',
        price: 0,
        downloads: 0,
        rating: 5.0,
        tags: ['默认', '可爱'],
        description: '系统自带的默认Live2D模型'
      }]);
    }
  }, [sessionUserId]);

  const fetchMarketModels = useCallback(async () => {
    try {
      const response = await axios.get(withApiBaseUrl('/api/ugc/models/market'));
      if (response.data.success) {
        setMarketModels(response.data.models);
      }
    } catch (error) {
      console.error('Failed to fetch market models:', error);
    }
  }, []);

  const fetchUserCredit = useCallback(async () => {
    try {
      const response = await axios.get(withApiBaseUrl('/api/ugc/user/credit'));
      if (response.data.success) {
        setUserCredit(response.data.credit);
      }
    } catch (error) {
      console.error('Failed to fetch user credit:', error);
    }
  }, []);

  useEffect(() => {
    fetchAvailableModels();
    fetchMarketModels();
    if (sessionUserId) {
      fetchUserCredit();
    }
    setLoading(false);
  }, [fetchAvailableModels, fetchMarketModels, fetchUserCredit, sessionUserId]);

  const handleModelChange = async (model: Live2DModel) => {
    try {
      setCurrentModel(model);
    } catch (error) {
      console.error('Failed to update model:', error);
    }
  };

  const handleModelPurchase = async (model: Live2DModel) => {
    if (userCredit < model.price) {
      alert('积分不足！');
      return;
    }

    try {
      const response = await axios.post(withApiBaseUrl('/api/ugc/models/purchase'), {
        modelId: model.id,
        userId: sessionUserId,
      });

      if (response.data.success) {
        alert('购买成功！');
        setUserCredit(response.data.newCredit);
        await fetchAvailableModels();
      }
    } catch (error: any) {
      alert(error.response?.data?.error || '购买失败');
    }
  };

  const handleModelUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploadingModel(true);
    try {
      const formData = new FormData();
      formData.append('model', file);
      formData.append('name', `自定义模型 ${Date.now()}`);
      formData.append('description', '用户上传的Live2D模型');
      formData.append('price', modelPrice.toString());
      formData.append('tags', JSON.stringify(['自定义']));
      formData.append('shareToCommunity', shareToCommunity.toString());

      const response = await axios.post(withApiBaseUrl('/api/ugc/models/upload'), formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      if (response.data.success) {
        await fetchMarketModels();
        alert('模型上传成功！');
      }
    } catch (error) {
      console.error('Failed to upload model:', error);
      alert('上传失败，请重试');
    } finally {
      setUploadingModel(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  if (loading) return <div className="p-8 text-center text-primary-dark dark:text-dark-text">加载中...</div>;

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-light via-primary-medium to-purple-200 text-primary-dark dark:bg-dark-bg p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-4xl font-bold mb-8 text-primary-dark dark:text-dark-text">Live2D模型管理</h1>

        {sessionUserId === userId && (
          <div className="space-y-6">
            {/* 我的模型 */}
            <div className="card dark:bg-dark-surface dark:border-dark-border">
              <h2 className="text-2xl font-bold text-primary-dark dark:text-dark-text mb-6">我的Live2D模型</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                {availableModels.map((model) => (
                  <div
                    key={model.id}
                    className={`p-4 rounded-lg border-2 transition cursor-pointer ${
                      currentModel?.id === model.id
                        ? 'border-accent-pink bg-accent-pink bg-opacity-10'
                        : 'border-primary-medium dark:border-dark-border hover:border-accent-pink'
                    }`}
                    onClick={() => handleModelChange(model)}
                  >
                    <div className="text-center">
                      <div className="text-3xl mb-2">🎭</div>
                      <p className="text-sm font-medium text-primary-dark dark:text-dark-text">{model.name}</p>
                      <p className="text-xs text-text-light dark:text-dark-text-secondary">
                        {model.price === 0 ? '免费' : `${model.price}积分`}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 模型市场 */}
            <div className="card dark:bg-dark-surface dark:border-dark-border">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-primary-dark dark:text-dark-text">Live2D模型市场</h2>
                <div className="text-primary-dark dark:text-dark-text">
                  我的积分: <span className="font-bold text-accent-pink">{userCredit}</span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
                {marketModels.map((model) => (
                  <div key={model.id} className="border border-primary-medium dark:border-dark-border rounded-lg p-4 hover:shadow-medium transition">
                    <div className="text-center mb-4">
                      <div className="text-4xl mb-2">🎭</div>
                      <h3 className="font-bold text-primary-dark dark:text-dark-text">{model.name}</h3>
                      <p className="text-sm text-text-light dark:text-dark-text-secondary">{model.description}</p>
                    </div>

                    <div className="flex justify-between items-center mb-3">
                      <span className="text-sm text-text-light dark:text-dark-text-secondary">
                        上传者: {model.uploaderName}
                      </span>
                      <span className="text-accent-pink font-bold">{model.price} 积分</span>
                    </div>

                    <div className="flex justify-between text-xs text-text-light dark:text-dark-text-secondary mb-4">
                      <span>下载: {model.downloads}</span>
                      <span>评分: {model.rating.toFixed(1)}</span>
                    </div>

                    <button
                      onClick={() => handleModelPurchase(model)}
                      disabled={userCredit < model.price}
                      className="w-full btn btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {userCredit >= model.price ? '购买' : '积分不足'}
                    </button>
                  </div>
                ))}
              </div>

              {marketModels.length === 0 && (
                <p className="text-center text-text-light dark:text-dark-text-secondary py-8">
                  暂无模型上架，快来上传你的作品吧！
                </p>
              )}
            </div>

            {/* 上传模型 */}
            <div className="card dark:bg-dark-surface dark:border-dark-border">
              <h2 className="text-2xl font-bold text-primary-dark dark:text-dark-text mb-6">上传Live2D模型</h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-primary-dark dark:text-dark-text mb-2">设置价格 (积分)</label>
                  <input
                    type="number"
                    min="1"
                    value={modelPrice}
                    onChange={(e) => setModelPrice(Number(e.target.value))}
                    className="form-input"
                  />
                </div>

                <div>
                  <label className="flex items-center gap-2 text-primary-dark dark:text-dark-text">
                    <input
                      type="checkbox"
                      checked={shareToCommunity}
                      onChange={(e) => setShareToCommunity(e.target.checked)}
                      className="rounded"
                    />
                    上传到社区市场供其他玩家购买
                  </label>
                </div>

                <div>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="btn btn-secondary mr-4"
                    disabled={uploadingModel}
                  >
                    {uploadingModel ? '上传中...' : '选择模型文件'}
                  </button>
                  <span className="text-sm text-text-light dark:text-dark-text-secondary">
                    支持 .zip 格式的Live2D模型文件
                  </span>
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".zip,.rar"
                  onChange={handleModelUpload}
                  className="hidden"
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Models;
