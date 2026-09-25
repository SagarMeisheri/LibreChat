import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Modal,
  FlatList,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  Menu,
  Plus,
  Send,
  Square,
  Sparkles,
  Bot,
  User as UserIcon,
  ChevronDown,
  Wrench,
  Brain,
  Code2,
  Trash2,
  LogOut,
  X,
} from 'lucide-react-native';
import { sendStreamingMessage } from '../../src/services/transport';
import {
  fetchConversations,
  fetchConversationMessages,
  deleteConversation,
  ConvoItem,
} from '../../src/services/api';
import { clearAuthSession, getUserProfile, MobileUser } from '../../src/services/storage';
import { ArtifactModal, ArtifactData } from '../../src/components/ArtifactModal';

interface MessageItem {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  thought?: string;
  toolCall?: {
    id: string;
    name: string;
    args?: any;
    status: string;
  };
  artifact?: ArtifactData;
}

const AVAILABLE_MODELS = [
  { id: 'gpt-4o', name: 'GPT-4o', endpoint: 'openAI' },
  { id: 'claude-3-5-sonnet', name: 'Claude 3.5 Sonnet', endpoint: 'anthropic' },
  { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', endpoint: 'google' },
];

export default function ChatScreen() {
  const router = useRouter();
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [inputText, setInputText] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedModel, setSelectedModel] = useState(AVAILABLE_MODELS[0]);
  const [activeConversationId, setActiveConversationId] = useState<string>('');

  // Modals & Drawers
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [modelPickerOpen, setModelPickerOpen] = useState(false);
  const [activeArtifact, setActiveArtifact] = useState<ArtifactData | null>(null);

  // Conversation history
  const [conversations, setConversations] = useState<ConvoItem[]>([]);
  const [userProfile, setUserProfile] = useState<MobileUser | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const scrollViewRef = useRef<ScrollView>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    getUserProfile().then((u) => setUserProfile(u));
    loadConversations();
  }, []);

  const loadConversations = async () => {
    setLoadingHistory(true);
    try {
      const data = await fetchConversations(1);
      if (data?.conversations) {
        setConversations(data.conversations);
      }
    } catch (err) {
      console.warn('[Chat] Failed to load conversations:', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleSelectConversation = async (convo: ConvoItem) => {
    setDrawerOpen(false);
    setActiveConversationId(convo.conversationId);
    setMessages([]);

    try {
      const rawMessages = await fetchConversationMessages(convo.conversationId);
      if (Array.isArray(rawMessages)) {
        const mapped: MessageItem[] = rawMessages.map((m: any) => ({
          id: m.messageId || Math.random().toString(),
          role: m.isCreatedByUser ? 'user' : 'assistant',
          content: m.text || '',
        }));
        setMessages(mapped);
      }
    } catch (err) {
      console.warn('[Chat] Failed to load conversation messages:', err);
    }
  };

  const handleNewChat = () => {
    if (isGenerating) handleAbort();
    setActiveConversationId('');
    setMessages([]);
    setDrawerOpen(false);
  };

  const handleDeleteConversation = async (conversationId: string) => {
    try {
      await deleteConversation(conversationId);
      setConversations((prev) => prev.filter((c) => c.conversationId !== conversationId));
      if (activeConversationId === conversationId) {
        handleNewChat();
      }
    } catch (err) {
      Alert.alert('Error', 'Failed to delete conversation.');
    }
  };

  const handleLogout = async () => {
    await clearAuthSession();
    router.replace('/(auth)/login');
  };

  const handleSendMessage = async () => {
    const text = inputText.trim();
    if (!text || isGenerating) return;

    setInputText('');
    const userMsgId = Date.now().toString();
    const assistantMsgId = (Date.now() + 1).toString();

    // Append User Message
    const updatedMessages: MessageItem[] = [
      ...messages,
      { id: userMsgId, role: 'user', content: text },
      { id: assistantMsgId, role: 'assistant', content: '' },
    ];
    setMessages(updatedMessages);
    setIsGenerating(true);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);

    await sendStreamingMessage(
      {
        text,
        conversationId: activeConversationId || undefined,
        endpoint: selectedModel.endpoint,
        model: selectedModel.id,
      },
      {
        onDelta: (delta) => {
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantMsgId ? { ...msg, content: msg.content + delta } : msg,
            ),
          );
          scrollViewRef.current?.scrollToEnd({ animated: false });
        },
        onThinking: (thought) => {
          setMessages((prev) =>
            prev.map((msg) => (msg.id === assistantMsgId ? { ...msg, thought } : msg)),
          );
        },
        onToolCall: (toolCall) => {
          setMessages((prev) =>
            prev.map((msg) => (msg.id === assistantMsgId ? { ...msg, toolCall } : msg)),
          );
        },
        onArtifact: (artifact) => {
          setMessages((prev) =>
            prev.map((msg) => (msg.id === assistantMsgId ? { ...msg, artifact } : msg)),
          );
        },
        onComplete: (finalData) => {
          setIsGenerating(false);
          abortControllerRef.current = null;
          if (finalData.conversationId && !activeConversationId) {
            setActiveConversationId(finalData.conversationId);
            loadConversations();
          }
        },
        onError: (err) => {
          setIsGenerating(false);
          abortControllerRef.current = null;
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantMsgId
                ? { ...msg, content: `Error: ${err.message || 'Stream interrupted'}` }
                : msg,
            ),
          );
        },
      },
      controller.signal,
    );
  };

  const handleAbort = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsGenerating(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-background">
      {/* Top Header Bar */}
      <View className="flex-row items-center justify-between px-4 py-2.5 border-b border-border-light bg-surface-primary">
        <TouchableOpacity
          onPress={() => setDrawerOpen(true)}
          className="w-9 h-9 rounded-lg bg-surface-secondary items-center justify-center border border-border-light"
        >
          <Menu size={18} color="#ececec" />
        </TouchableOpacity>

        {/* Model Switcher Pill */}
        <TouchableOpacity
          onPress={() => setModelPickerOpen(true)}
          className="flex-row items-center bg-surface-secondary px-3 py-1.5 rounded-full border border-border-light"
        >
          <Sparkles size={13} color="#10a37f" />
          <Text className="text-text-primary text-xs font-semibold mx-1.5">
            {selectedModel.name}
          </Text>
          <ChevronDown size={13} color="#8e8e8e" />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleNewChat}
          className="w-9 h-9 rounded-lg bg-surface-secondary items-center justify-center border border-border-light"
        >
          <Plus size={18} color="#ececec" />
        </TouchableOpacity>
      </View>

      {/* Main Chat Messages Feed */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
        className="flex-1"
      >
        <ScrollView
          ref={scrollViewRef}
          className="flex-1 px-4 py-3"
          contentContainerStyle={{ paddingBottom: 24 }}
        >
          {messages.length === 0 ? (
            <View className="items-center justify-center py-24">
              <View className="w-14 h-14 rounded-2xl bg-surface-secondary border border-border-light items-center justify-center mb-4">
                <Bot size={28} color="#10a37f" />
              </View>
              <Text className="text-text-primary text-lg font-bold">How can I help you today?</Text>
              <Text className="text-text-tertiary text-xs mt-1">
                Connected with {selectedModel.name}
              </Text>
            </View>
          ) : (
            messages.map((item) => (
              <View
                key={item.id}
                className={`mb-4 flex-row ${item.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {item.role === 'assistant' && (
                  <View className="w-7 h-7 rounded-lg bg-brand-green/20 items-center justify-center mr-2.5 mt-1 border border-brand-green/30">
                    <Bot size={15} color="#10a37f" />
                  </View>
                )}

                <View
                  className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                    item.role === 'user'
                      ? 'bg-surface-secondary border border-border-light'
                      : 'bg-surface-primary border border-border-light'
                  }`}
                >
                  {/* Reasoning / Thinking Card */}
                  {item.thought && (
                    <View className="mb-2 p-2.5 rounded-lg bg-surface-secondary border border-border-medium/40">
                      <View className="flex-row items-center mb-1">
                        <Brain size={12} color="#a5d6ff" />
                        <Text className="text-[#a5d6ff] text-[11px] font-semibold ml-1.5">
                          Thinking Process
                        </Text>
                      </View>
                      <Text className="text-text-secondary text-xs italic">{item.thought}</Text>
                    </View>
                  )}

                  {/* Tool Call Card */}
                  {item.toolCall && (
                    <View className="mb-2 p-2.5 rounded-lg bg-surface-secondary border border-border-medium/40 flex-row items-center justify-between">
                      <View className="flex-row items-center">
                        <Wrench size={13} color="#f59e0b" />
                        <Text className="text-text-primary text-xs font-medium ml-1.5">
                          Tool: {item.toolCall.name}
                        </Text>
                      </View>
                      <View className="bg-amber-500/20 px-2 py-0.5 rounded">
                        <Text className="text-amber-400 text-[10px] uppercase font-semibold">
                          {item.toolCall.status}
                        </Text>
                      </View>
                    </View>
                  )}

                  {/* Main Message Text */}
                  <Text className="text-text-primary text-sm leading-5">
                    {item.content || (isGenerating && item.role === 'assistant' ? '...' : '')}
                  </Text>

                  {/* Interactive Artifact Preview Button */}
                  {item.artifact && (
                    <TouchableOpacity
                      onPress={() => setActiveArtifact(item.artifact!)}
                      className="mt-3 flex-row items-center bg-brand-green/15 border border-brand-green/40 px-3 py-2 rounded-xl"
                    >
                      <Code2 size={14} color="#10a37f" />
                      <View className="ml-2 flex-1">
                        <Text className="text-brand-green font-semibold text-xs">
                          {item.artifact.title}
                        </Text>
                        <Text className="text-text-tertiary text-[10px] uppercase">
                          Tap to view preview & code
                        </Text>
                      </View>
                    </TouchableOpacity>
                  )}
                </View>

                {item.role === 'user' && (
                  <View className="w-7 h-7 rounded-lg bg-surface-secondary items-center justify-center ml-2.5 mt-1 border border-border-light">
                    <UserIcon size={14} color="#ececec" />
                  </View>
                )}
              </View>
            ))
          )}
        </ScrollView>

        {/* Input Composer Bar */}
        <View className="p-3 bg-surface-primary border-t border-border-light">
          <View className="flex-row items-center bg-surface-secondary rounded-2xl border border-border-medium px-3.5 py-1.5">
            <TextInput
              value={inputText}
              onChangeText={setInputText}
              placeholder="Ask anything..."
              placeholderTextColor="#666666"
              multiline
              maxLength={4000}
              className="flex-1 text-text-primary text-sm max-h-24 py-2"
            />

            {isGenerating ? (
              <TouchableOpacity
                onPress={handleAbort}
                className="w-8 h-8 rounded-full bg-red-500/20 items-center justify-center border border-red-500/40 ml-2"
              >
                <Square size={14} color="#ef4444" fill="#ef4444" />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                onPress={handleSendMessage}
                disabled={!inputText.trim()}
                className={`w-8 h-8 rounded-full items-center justify-center ml-2 ${
                  inputText.trim() ? 'bg-brand-green' : 'bg-surface-tertiary'
                }`}
              >
                <Send size={14} color={inputText.trim() ? '#ffffff' : '#666666'} />
              </TouchableOpacity>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>

      {/* Model Picker Sheet */}
      <Modal visible={modelPickerOpen} transparent animationType="fade">
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => setModelPickerOpen(false)}
          className="flex-1 bg-black/60 justify-end"
        >
          <View className="bg-surface-primary rounded-t-3xl border-t border-border-light p-6">
            <View className="flex-row justify-between items-center mb-4">
              <Text className="text-text-primary text-base font-bold">Select Model</Text>
              <TouchableOpacity onPress={() => setModelPickerOpen(false)}>
                <X size={18} color="#ececec" />
              </TouchableOpacity>
            </View>

            <View className="gap-2.5">
              {AVAILABLE_MODELS.map((model) => (
                <TouchableOpacity
                  key={model.id}
                  onPress={() => {
                    setSelectedModel(model);
                    setModelPickerOpen(false);
                  }}
                  className={`p-3.5 rounded-xl border flex-row items-center justify-between ${
                    selectedModel.id === model.id
                      ? 'bg-brand-green/10 border-brand-green'
                      : 'bg-surface-secondary border-border-light'
                  }`}
                >
                  <Text className="text-text-primary font-semibold text-sm">{model.name}</Text>
                  <Text className="text-text-tertiary text-xs uppercase">{model.endpoint}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Conversation History Drawer Modal */}
      <Modal visible={drawerOpen} animationType="slide">
        <SafeAreaView className="flex-1 bg-background">
          <View className="flex-row items-center justify-between px-5 py-4 border-b border-border-light bg-surface-primary">
            <Text className="text-text-primary font-bold text-lg">Conversations</Text>
            <TouchableOpacity
              onPress={() => setDrawerOpen(false)}
              className="w-8 h-8 rounded-full bg-surface-secondary items-center justify-center border border-border-light"
            >
              <X size={18} color="#ececec" />
            </TouchableOpacity>
          </View>

          {/* New Chat Button */}
          <View className="p-4 border-b border-border-light">
            <TouchableOpacity
              onPress={handleNewChat}
              className="flex-row items-center justify-center bg-brand-green py-3 rounded-xl"
            >
              <Plus size={16} color="#ffffff" />
              <Text className="text-white font-bold text-sm ml-2">New Conversation</Text>
            </TouchableOpacity>
          </View>

          {/* Conversation List */}
          {loadingHistory ? (
            <View className="flex-1 items-center justify-center">
              <ActivityIndicator size="small" color="#10a37f" />
            </View>
          ) : (
            <FlatList
              data={conversations}
              keyExtractor={(item) => item.conversationId}
              contentContainerStyle={{ padding: 16 }}
              renderItem={({ item }) => (
                <View className="flex-row items-center justify-between bg-surface-primary mb-2.5 p-3.5 rounded-xl border border-border-light">
                  <TouchableOpacity
                    onPress={() => handleSelectConversation(item)}
                    className="flex-1 mr-3"
                  >
                    <Text className="text-text-primary font-medium text-sm" numberOfLines={1}>
                      {item.title || 'Untitled Conversation'}
                    </Text>
                    <Text className="text-text-tertiary text-[11px] mt-1">
                      {new Date(item.updatedAt).toLocaleDateString()}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => handleDeleteConversation(item.conversationId)}
                    className="p-1.5"
                  >
                    <Trash2 size={16} color="#8e8e8e" />
                  </TouchableOpacity>
                </View>
              )}
              ListEmptyComponent={
                <View className="items-center justify-center py-16">
                  <Text className="text-text-tertiary text-sm">No conversations yet.</Text>
                </View>
              }
            />
          )}

          {/* User Profile & Sign Out Footer */}
          <View className="p-4 border-t border-border-light bg-surface-primary flex-row items-center justify-between">
            <View className="flex-1 mr-3">
              <Text className="text-text-primary font-semibold text-sm" numberOfLines={1}>
                {userProfile?.name || userProfile?.email || 'User'}
              </Text>
              <Text className="text-text-tertiary text-xs" numberOfLines={1}>
                {userProfile?.email}
              </Text>
            </View>

            <TouchableOpacity
              onPress={handleLogout}
              className="flex-row items-center bg-surface-secondary px-3 py-2 rounded-lg border border-border-light"
            >
              <LogOut size={14} color="#ef4444" />
              <Text className="text-red-400 text-xs font-semibold ml-1.5">Sign Out</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>

      {/* Artifact Preview Modal */}
      <ArtifactModal
        visible={!!activeArtifact}
        artifact={activeArtifact}
        onClose={() => setActiveArtifact(null)}
      />
    </SafeAreaView>
  );
}
